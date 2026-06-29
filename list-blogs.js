#!/usr/bin/env node
/**
 * List all blogs in your Shopify store
 * ======================================
 * Run this BEFORE import.js to find the correct Blog ID.
 *
 * USAGE:
 *   node list-blogs.js
 *
 * OUTPUT example:
 *   ID: gid://shopify/Blog/122489635182   Handle: news   Title: News
 *   ID: gid://shopify/Blog/100000000001   Handle: tips   Title: Tips & Tricks
 *
 * Copy the ID of the blog you want and paste it into config.js → BLOG_ID
 */

'use strict';

let CONFIG;
try {
  CONFIG = require('./config.js');
} catch {
  console.error('\n❌  config.js not found. Run this from inside the blog-importer folder.\n');
  process.exit(1);
}

let fetchFn;
try {
  fetchFn = globalThis.fetch ?? require('node-fetch');
} catch {
  console.error('\n❌  Missing dependency. Please run:  npm install\n');
  process.exit(1);
}

const SHOPIFY_API_URL = `https://${CONFIG.SHOPIFY_STORE_URL}/admin/api/${CONFIG.API_VERSION}/graphql.json`;

const LIST_BLOGS_QUERY = `
  query {
    blogs(first: 50) {
      edges {
        node {
          id
          handle
          title
        }
      }
    }
  }
`;

async function listBlogs() {
  if (CONFIG.SHOPIFY_ACCESS_TOKEN === 'YOUR_ACCESS_TOKEN_HERE') {
    console.error('\n❌  SHOPIFY_ACCESS_TOKEN is not set in config.js');
    console.error('    See README.md → Step 3 for how to get your token.\n');
    process.exit(1);
  }

  console.log('\n🔍  Fetching blogs from:', CONFIG.SHOPIFY_STORE_URL);

  const response = await fetchFn(SHOPIFY_API_URL, {
    method:  'POST',
    headers: {
      'Content-Type':           'application/json',
      'X-Shopify-Access-Token': CONFIG.SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query: LIST_BLOGS_QUERY }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      console.error('\n❌  Authentication failed (401 Unauthorized)');
      console.error('    Your SHOPIFY_ACCESS_TOKEN is wrong or expired.');
      console.error('    Create a new one — see README.md → Step 3\n');
    } else {
      console.error(`\n❌  HTTP ${response.status}: ${response.statusText}\n`);
    }
    process.exit(1);
  }

  const json = await response.json();

  if (json.errors) {
    console.error('\n❌  GraphQL errors:');
    json.errors.forEach(e => console.error('   ', e.message));
    process.exit(1);
  }

  const blogs = json.data?.blogs?.edges ?? [];

  if (blogs.length === 0) {
    console.log('\n⚠️   No blogs found in this store.');
    console.log('    Create a blog first: Shopify Admin → Online Store → Blog Posts → Manage Blogs\n');
    return;
  }

  const idWidth    = 45;
  const handleWidth = 20;

  console.log('\n┌─────────────────────────────────────────────┬────────────────────┬──────────────────────┐');
  console.log('│ Blog ID                                     │ Handle             │ Title                │');
  console.log('├─────────────────────────────────────────────┼────────────────────┼──────────────────────┤');

  for (const { node } of blogs) {
    const id     = node.id.padEnd(idWidth);
    const handle = node.handle.padEnd(handleWidth);
    const title  = (node.title ?? '').substring(0, 20).padEnd(20);
    console.log(`│ ${id} │ ${handle} │ ${title} │`);
  }

  console.log('└─────────────────────────────────────────────┴────────────────────┴──────────────────────┘');
  console.log('\n✅  Copy the Blog ID you want and paste it into config.js → BLOG_ID\n');
}

listBlogs().catch(err => {
  console.error(`\n❌  Error: ${err.message}\n`);
  process.exit(1);
});
