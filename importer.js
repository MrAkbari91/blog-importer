'use strict';

const xml2js = require('xml2js');

let fetchFn;
try {
  fetchFn = globalThis.fetch ?? require('node-fetch');
} catch {
  fetchFn = require('node-fetch');
}

// ── GraphQL operations ────────────────────────────────────────

const LIST_BLOGS_QUERY = `
  query {
    blogs(first: 50) {
      edges { node { id handle title } }
    }
  }
`;

const FETCH_ARTICLES_QUERY = `
  query fetchArticles($blogId: ID!, $cursor: String) {
    blog(id: $blogId) {
      articles(first: 250, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges { node { id title } }
      }
    }
  }
`;

const CREATE_ARTICLE_MUTATION = `
  mutation articleCreate($article: ArticleCreateInput!) {
    articleCreate(article: $article) {
      article { id title handle }
      userErrors { field message }
    }
  }
`;

const UPDATE_ARTICLE_MUTATION = `
  mutation articleUpdate($id: ID!, $article: ArticleUpdateInput!) {
    articleUpdate(id: $id, article: $article) {
      article { id title handle }
      userErrors { field message }
    }
  }
`;

// ── Helpers ───────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function str(val) {
  if (!val) return '';
  if (Array.isArray(val)) return str(val[0]);
  if (typeof val === 'object' && val !== null) {
    return typeof val._ === 'string' ? val._ : '';
  }
  return String(val).trim();
}

function toISO(pubDate) {
  try {
    const d = new Date(pubDate);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function cleanHTML(html) {
  if (!html) return '';
  return html
    .replace(/<!--\s*wp:[^>]*?-->/g, '')
    .replace(/<!--\s*\/wp:[^>]*?-->/g, '')
    .trim();
}

// ── Shopify API ───────────────────────────────────────────────

async function shopifyRequest(storeUrl, token, apiVersion, body) {
  const url = `https://${storeUrl}/admin/api/${apiVersion}/graphql.json`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type':           'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }

  const json = await res.json();

  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors.map(e => e.message).join(' | '));
  }

  return json;
}

async function listBlogs(storeUrl, token, apiVersion = '2024-01') {
  const json  = await shopifyRequest(storeUrl, token, apiVersion, { query: LIST_BLOGS_QUERY });
  const edges = json.data?.blogs?.edges ?? [];
  return edges.map(({ node }) => ({ id: node.id, handle: node.handle, title: node.title }));
}

/**
 * Fetch all existing articles from a blog.
 * Returns a Map of lowercased title → article ID.
 */
async function fetchExistingArticles(storeUrl, token, blogId, apiVersion, onProgress) {
  const titleMap = new Map();
  let cursor     = null;
  let page       = 0;

  do {
    page++;
    onProgress && onProgress(`Fetching existing articles page ${page}...`);

    const json = await shopifyRequest(storeUrl, token, apiVersion, {
      query:     FETCH_ARTICLES_QUERY,
      variables: { blogId, cursor },
    });

    const articlesData = json.data?.blog?.articles;
    if (!articlesData) break;

    for (const { node } of articlesData.edges) {
      titleMap.set(node.title.toLowerCase().trim(), node.id);
    }

    if (articlesData.pageInfo.hasNextPage) {
      cursor = articlesData.pageInfo.endCursor;
    } else {
      cursor = null;
    }
  } while (cursor);

  return titleMap;
}

async function createArticle(storeUrl, token, blogId, authorName, post, apiVersion) {
  const json = await shopifyRequest(storeUrl, token, apiVersion, {
    query:     CREATE_ARTICLE_MUTATION,
    variables: {
      article: {
        blogId,
        title:       post.title,
        body:        post.body,
        isPublished: true,
        publishDate: post.publishedAt,
        author:      { name: authorName },
      },
    },
  });

  const { article, userErrors } = json.data.articleCreate;
  if (userErrors && userErrors.length > 0) {
    throw new Error(userErrors.map(e => `[${e.field}] ${e.message}`).join(' | '));
  }
  return article;
}

async function updateArticle(storeUrl, token, articleId, authorName, post, apiVersion) {
  const json = await shopifyRequest(storeUrl, token, apiVersion, {
    query:     UPDATE_ARTICLE_MUTATION,
    variables: {
      id: articleId,
      article: {
        title:       post.title,
        body:        post.body,
        isPublished: true,
        publishDate: post.publishedAt,
        author:      { name: authorName },
      },
    },
  });

  const { article, userErrors } = json.data.articleUpdate;
  if (userErrors && userErrors.length > 0) {
    throw new Error(userErrors.map(e => `[${e.field}] ${e.message}`).join(' | '));
  }
  return article;
}

// ── XML Parser ────────────────────────────────────────────────

async function parseXMLBuffer(buffer) {
  const xmlContent = buffer.toString('utf8');

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
    throw new Error(`Invalid XML: ${err.message}`);
  }

  const channel = result?.rss?.channel?.[0];
  if (!channel) {
    throw new Error('Unexpected XML structure. Make sure this is a WordPress WXR export file.');
  }

  const items = channel.item || [];
  const posts = [];

  for (const item of items) {
    const postType = str(item.post_type);
    const status   = str(item.status);
    if (postType !== 'post' || status !== 'publish') continue;

    const title       = str(item.title);
    const rawBody     = str(item.encoded);
    const body        = cleanHTML(rawBody);
    const pubDate     = str(item.pubDate);
    const publishedAt = toISO(pubDate);

    if (!title) continue;
    posts.push({ title, body, publishedAt });
  }

  return { totalItems: items.length, posts };
}

// ── Main import runner ────────────────────────────────────────

async function runImport(
  { storeUrl, token, blogId, authorName, xmlBuffer, batchSize = 3, delayMs = 1000, apiVersion = '2024-01', limit = Infinity },
  onEvent
) {
  const emit = (type, data) => onEvent && onEvent(type, data);

  // 1. Parse XML
  emit('log', { msg: 'Parsing XML file...' });
  let totalItems, posts;
  try {
    ({ totalItems, posts } = await parseXMLBuffer(xmlBuffer));
  } catch (err) {
    emit('error', { msg: err.message });
    return;
  }

  emit('parse', { totalItems, postCount: posts.length });
  emit('log', { msg: `Found ${posts.length} published posts out of ${totalItems} total XML items.` });

  if (posts.length === 0) {
    emit('done', { created: 0, updated: 0, failed: 0, failedPosts: [] });
    return;
  }

  // 2. Fetch existing articles from Shopify to build title → ID map
  emit('log', { msg: 'Checking existing articles in Shopify blog...' });
  let existingMap;
  try {
    existingMap = await fetchExistingArticles(storeUrl, token, blogId, apiVersion, msg => {
      emit('log', { msg });
    });
  } catch (err) {
    emit('error', { msg: `Failed to fetch existing articles: ${err.message}` });
    return;
  }
  emit('log', { msg: `Found ${existingMap.size} existing article(s) in the blog. Will upsert.` });

  // 3. Apply limit
  const limited     = isFinite(limit) ? posts.slice(0, limit) : posts;
  const totalBatches = Math.ceil(limited.length / batchSize);

  let createdCount = 0;
  let updatedCount = 0;
  let failCount    = 0;
  const failedPosts = [];

  // 4. Process in batches
  for (let i = 0; i < limited.length; i += batchSize) {
    const batch    = limited.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;

    emit('batch_start', {
      batchNum,
      totalBatches,
      from:  i + 1,
      to:    Math.min(i + batchSize, limited.length),
      total: limited.length,
    });

    const results = await Promise.allSettled(
      batch.map(post => {
        const existingId = existingMap.get(post.title.toLowerCase().trim());
        if (existingId) {
          return updateArticle(storeUrl, token, existingId, authorName, post, apiVersion)
            .then(article => ({ article, action: 'updated' }));
        }
        return createArticle(storeUrl, token, blogId, authorName, post, apiVersion)
          .then(article => ({ article, action: 'created' }));
      })
    );

    const batchResults = [];

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const post   = batch[j];

      if (result.status === 'fulfilled') {
        const { action } = result.value;
        if (action === 'updated') updatedCount++;
        else                      createdCount++;
        batchResults.push({ title: post.title, ok: true, action });
      } else {
        failCount++;
        const errMsg = result.reason?.message ?? 'Unknown error';
        failedPosts.push({ title: post.title, error: errMsg });
        batchResults.push({ title: post.title, ok: false, error: errMsg });
      }
    }

    emit('batch_done', {
      batchNum,
      totalBatches,
      results: batchResults,
      done:    Math.min(i + batchSize, limited.length),
      total:   limited.length,
      createdCount,
      updatedCount,
      failCount,
    });

    if (i + batchSize < limited.length) {
      await sleep(delayMs);
    }
  }

  emit('done', { created: createdCount, updated: updatedCount, failed: failCount, failedPosts });
}

module.exports = { listBlogs, parseXMLBuffer, runImport };
