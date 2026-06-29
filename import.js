#!/usr/bin/env node
/**
 * WordPress → Shopify Blog Importer
 * ===================================
 * Reads a WordPress XML export file and imports all published
 * blog posts into a Shopify store's blog via the Admin GraphQL API.
 *
 * USAGE:
 *   node import.js               → import all posts
 *   node import.js --dry-run     → preview only (nothing is imported)
 *   node import.js --limit=10    → import only the first 10 posts
 *
 * SETUP: Edit config.js before running. See README.md for full guide.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Load config ────────────────────────────────────────────────
let CONFIG;
try {
  CONFIG = require('./config.js');
} catch {
  console.error('\n❌  config.js not found. Make sure you are running this');
  console.error('    command from inside the blog-importer folder.\n');
  process.exit(1);
}

// ── Load xml2js ────────────────────────────────────────────────
let xml2js;
try {
  xml2js = require('xml2js');
} catch {
  console.error('\n❌  Missing dependency: xml2js');
  console.error('    Please run:  npm install\n');
  process.exit(1);
}

// ── Load node-fetch (falls back to native fetch on Node 18+) ──
let fetchFn;
try {
  fetchFn = globalThis.fetch ?? require('node-fetch');
} catch {
  console.error('\n❌  Missing dependency: node-fetch');
  console.error('    Please run:  npm install\n');
  process.exit(1);
}

// ── Parse CLI flags ────────────────────────────────────────────
const IS_DRY_RUN = process.argv.includes('--dry-run');
const limitArg   = process.argv.find(a => a.startsWith('--limit='));
const LIMIT      = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

// ── Derived constants ─────────────────────────────────────────
const SHOPIFY_API_URL = `https://${CONFIG.SHOPIFY_STORE_URL}/admin/api/${CONFIG.API_VERSION}/graphql.json`;

// ─────────────────────────────────────────────────────────────
//  GraphQL mutation
// ─────────────────────────────────────────────────────────────
const CREATE_ARTICLE_MUTATION = `
  mutation articleCreate($article: ArticleCreateInput!) {
    articleCreate(article: $article) {
      article {
        id
        title
        handle
        onlineStoreUrl
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────
//  Utility helpers
// ─────────────────────────────────────────────────────────────

/** Sleep for `ms` milliseconds. */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safely extract a plain string from an xml2js parsed value.
 * xml2js wraps text in arrays and objects; this unwraps them.
 */
function str(val) {
  if (!val) return '';
  if (Array.isArray(val)) return str(val[0]);
  if (typeof val === 'object' && val !== null) {
    if (typeof val._ === 'string') return val._;
    // Handle plain objects that are empty (self-closing tags)
    return '';
  }
  return String(val).trim();
}

/**
 * Convert a WordPress pubDate (RFC 2822) or any date string
 * into an ISO 8601 string required by Shopify.
 * Falls back to current time if the date is invalid.
 */
function toISO(pubDate) {
  try {
    const d = new Date(pubDate);
    if (isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Remove Gutenberg/WordPress block editor comment markers.
 * These look like:  <!-- wp:paragraph --> … <!-- /wp:paragraph -->
 */
function cleanHTML(html) {
  if (!html) return '';
  return html
    .replace(/<!--\s*wp:[^>]*?-->/g, '')
    .replace(/<!--\s*\/wp:[^>]*?-->/g, '')
    .trim();
}

// ─────────────────────────────────────────────────────────────
//  Step 1 — Parse WordPress XML
// ─────────────────────────────────────────────────────────────

async function parseWordPressXML(filePath) {
  const absolutePath = path.resolve(filePath);

  print(`📂  XML file : ${absolutePath}`);

  if (!fs.existsSync(absolutePath)) {
    console.error(`\n❌  File not found: ${absolutePath}`);
    console.error('    Double-check the XML_FILE_PATH in config.js\n');
    process.exit(1);
  }

  const xmlContent = fs.readFileSync(absolutePath, 'utf8');
  print(`    File size : ${(xmlContent.length / 1024).toFixed(1)} KB`);

  // Parse with namespace prefix stripping so we can access
  // wp:post_type as post_type, content:encoded as encoded, etc.
  const parser = new xml2js.Parser({
    tagNameProcessors: [xml2js.processors.stripPrefix],
    explicitArray:     true,
    explicitCharkey:   true,
    charkey:           '_',
    attrkey:           '$',
  });

  let result;
  try {
    result = await parser.parseStringPromise(xmlContent);
  } catch (err) {
    console.error(`\n❌  Failed to parse XML: ${err.message}`);
    console.error('    Make sure the file is a valid WordPress export (WXR format).\n');
    process.exit(1);
  }

  const channel = result?.rss?.channel?.[0];
  if (!channel) {
    console.error('\n❌  Unexpected XML structure. Expected <rss><channel> … </channel></rss>');
    console.error('    Make sure you exported from WordPress: Tools → Export → All content\n');
    process.exit(1);
  }

  const items = channel.item || [];
  print(`    Total XML items  : ${items.length}`);

  const posts = [];

  for (const item of items) {
    const postType = str(item.post_type);
    const status   = str(item.status);

    // Only import published blog posts (skip pages, attachments, drafts, etc.)
    if (postType !== 'post' || status !== 'publish') continue;

    const title       = str(item.title);
    const rawBody     = str(item.encoded);   // content:encoded → encoded after stripPrefix
    const body        = cleanHTML(rawBody);
    const pubDate     = str(item.pubDate);
    const publishedAt = toISO(pubDate);

    if (!title) continue;  // skip posts with no title

    posts.push({ title, body, publishedAt });
  }

  print(`    Published posts  : ${posts.length}`);
  return posts;
}

// ─────────────────────────────────────────────────────────────
//  Step 2 — Call Shopify GraphQL API
// ─────────────────────────────────────────────────────────────

async function createArticle(post) {
  const variables = {
    article: {
      blogId:      CONFIG.BLOG_ID,
      title:       post.title,
      body:        post.body,
      isPublished: true,
      publishDate: post.publishedAt,
      author:      { name: CONFIG.AUTHOR_NAME },
    },
  };

  const response = await fetchFn(SHOPIFY_API_URL, {
    method:  'POST',
    headers: {
      'Content-Type':             'application/json',
      'X-Shopify-Access-Token':   CONFIG.SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query: CREATE_ARTICLE_MUTATION, variables }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const json = await response.json();

  // GraphQL-level errors (e.g. authentication failure)
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors.map(e => e.message).join(' | '));
  }

  const { article, userErrors } = json.data.articleCreate;

  // Shopify business-logic errors (e.g. missing required field)
  if (userErrors && userErrors.length > 0) {
    throw new Error(userErrors.map(e => `[${e.field}] ${e.message}`).join(' | '));
  }

  return article;
}

// ─────────────────────────────────────────────────────────────
//  Validation helpers
// ─────────────────────────────────────────────────────────────

function validateConfig() {
  const errors = [];

  if (!CONFIG.SHOPIFY_STORE_URL || CONFIG.SHOPIFY_STORE_URL.includes('YOUR')) {
    errors.push('SHOPIFY_STORE_URL is not set');
  }
  if (!CONFIG.SHOPIFY_ACCESS_TOKEN || CONFIG.SHOPIFY_ACCESS_TOKEN === 'YOUR_ACCESS_TOKEN_HERE') {
    errors.push('SHOPIFY_ACCESS_TOKEN is not set (see README.md → Step 3)');
  }
  if (!CONFIG.BLOG_ID || CONFIG.BLOG_ID.includes('YOUR')) {
    errors.push('BLOG_ID is not set (run: node list-blogs.js)');
  }
  if (!CONFIG.XML_FILE_PATH) {
    errors.push('XML_FILE_PATH is not set');
  }

  if (errors.length > 0) {
    console.error('\n❌  Please fix the following in config.js:\n');
    errors.forEach(e => console.error(`    • ${e}`));
    console.error('');
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────
//  Simple print helper (respects dry-run label)
// ─────────────────────────────────────────────────────────────

function print(msg) {
  console.log(msg);
}

// ─────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────

async function main() {
  print('\n╔══════════════════════════════════════════════╗');
  print('║   WordPress → Shopify Blog Importer  v1.0   ║');
  print('╚══════════════════════════════════════════════╝\n');

  if (IS_DRY_RUN) {
    print('🔍  DRY RUN MODE — Posts will be listed but NOT imported.\n');
  }

  // Validate config before doing anything
  validateConfig();

  // Parse XML
  const allPosts = await parseWordPressXML(CONFIG.XML_FILE_PATH);

  if (allPosts.length === 0) {
    print('\n⚠️   No published blog posts found in the XML file.');
    print('    Make sure you exported "All content" from WordPress.\n');
    process.exit(0);
  }

  // Apply --limit flag
  const posts = isFinite(LIMIT) ? allPosts.slice(0, LIMIT) : allPosts;
  if (isFinite(LIMIT)) {
    print(`\n    Limiting to first ${LIMIT} post(s) (--limit flag).`);
  }

  // Preview
  print('\n📋  Posts to be imported:');
  posts.slice(0, 5).forEach((p, i) => {
    print(`    ${String(i + 1).padStart(2, ' ')}. [${p.publishedAt.slice(0, 10)}]  ${p.title}`);
  });
  if (posts.length > 5) {
    print(`        … and ${posts.length - 5} more`);
  }

  // DRY RUN — stop here
  if (IS_DRY_RUN) {
    print(`\n✅  DRY RUN complete. ${posts.length} post(s) would be imported.`);
    print('    Run without --dry-run to actually import.\n');
    return;
  }

  // ── Start import ──────────────────────────────────────────
  print(`\n🚀  Importing to : https://${CONFIG.SHOPIFY_STORE_URL}`);
  print(`    Blog ID      : ${CONFIG.BLOG_ID}`);
  print(`    Author       : ${CONFIG.AUTHOR_NAME}`);
  print(`    Batch size   : ${CONFIG.BATCH_SIZE}`);
  print(`    Total posts  : ${posts.length}\n`);

  let successCount = 0;
  let failCount    = 0;
  const failed     = [];

  for (let i = 0; i < posts.length; i += CONFIG.BATCH_SIZE) {
    const batch      = posts.slice(i, i + CONFIG.BATCH_SIZE);
    const batchNum   = Math.floor(i / CONFIG.BATCH_SIZE) + 1;
    const totalBatch = Math.ceil(posts.length / CONFIG.BATCH_SIZE);

    process.stdout.write(`   Batch ${String(batchNum).padStart(3)}/${totalBatch}  `);

    const results = await Promise.allSettled(batch.map(post => createArticle(post)));

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const post   = batch[j];

      if (result.status === 'fulfilled') {
        process.stdout.write('✅ ');
        successCount++;
      } else {
        process.stdout.write('❌ ');
        failCount++;
        failed.push({ title: post.title, error: result.reason?.message ?? 'Unknown error' });
      }
    }

    const done = Math.min(i + CONFIG.BATCH_SIZE, posts.length);
    process.stdout.write(`  [${done}/${posts.length}]\n`);

    // Wait between batches to avoid hitting Shopify rate limits
    if (i + CONFIG.BATCH_SIZE < posts.length) {
      await sleep(CONFIG.DELAY_MS);
    }
  }

  // ── Final summary ─────────────────────────────────────────
  print('\n╔══════════════════════════════════════════════╗');
  print('║                   SUMMARY                   ║');
  print('╚══════════════════════════════════════════════╝');
  print(`   ✅  Imported successfully : ${successCount} post(s)`);
  print(`   ❌  Failed                : ${failCount} post(s)`);

  if (failed.length > 0) {
    print('\n   Failed posts:');
    failed.forEach(f => {
      print(`   •  "${f.title}"`);
      print(`      Error: ${f.error}`);
    });
  }

  const blogSlug = CONFIG.BLOG_ID.split('/').pop();
  print(`\n   🔗  View your blog at:`);
  print(`       https://${CONFIG.SHOPIFY_STORE_URL}/blogs/news\n`);

  if (failCount > 0) {
    print('   💡  Tip: Run the script again — previously imported posts are');
    print('       simply duplicated and can be deleted from Shopify admin.\n');
  }
}

main().catch(err => {
  console.error(`\n❌  Unexpected error: ${err.message}\n`);
  if (err.message.includes('401') || err.message.includes('Unauthorized')) {
    console.error('    → Your SHOPIFY_ACCESS_TOKEN is wrong or expired.');
    console.error('      Create a new one: see README.md → Step 3\n');
  }
  process.exit(1);
});
