# Technical Plan — WordPress → Shopify Blog Importer

## Overview

This tool migrates blog content from a WordPress site (exported as WXR XML) to a
Shopify store's blog section using the Shopify Admin GraphQL API.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        USER WORKFLOW                             │
│                                                                  │
│  1. Edit config.js                                               │
│  2. Run `node list-blogs.js`  →  find Blog ID                   │
│  3. Run `node import.js`      →  posts imported to Shopify       │
└──────────────────────────────────────────────────────────────────┘

                         ┌──────────────┐
                         │  config.js   │  ← single source of truth
                         └──────┬───────┘
                                │ require()
              ┌─────────────────┴──────────────────┐
              │                                    │
     ┌────────▼────────┐                  ┌────────▼────────┐
     │  list-blogs.js  │                  │   import.js     │
     │                 │                  │                 │
     │  GraphQL query  │                  │  1. Parse XML   │
     │  → list blogs   │                  │  2. Filter posts│
     │  → print IDs    │                  │  3. GraphQL     │
     └─────────────────┘                  │     mutations   │
                                          │  4. Batch send  │
                                          └─────────────────┘
```

---

## File Responsibilities

| File | Role | Should Users Edit? |
|---|---|---|
| `config.js` | All user-configurable values | ✅ YES — only this file |
| `import.js` | XML parser + Shopify importer | ❌ No |
| `list-blogs.js` | Helper to list blog IDs | ❌ No |
| `package.json` | npm dependencies and scripts | ❌ No |
| `README.md` | End-user setup guide | ❌ No |
| `plan.md` | This file — technical reference | ❌ No |

---

## Data Flow — import.js

```
WordPress XML file
       │
       ▼
[xml2js parser]
  • tagNameProcessors: [stripPrefix]
    Strips XML namespace prefixes so:
      wp:post_type  →  post_type
      wp:status     →  status
      content:encoded → encoded
  • explicitArray: true  (all values are arrays)
  • explicitCharkey: true (CDATA values stored in `._`)
       │
       ▼
[Filter: only published blog posts]
  • item.post_type[0]._ === 'post'
  • item.status[0]._    === 'publish'
       │
       ▼
[Transform each post]
  • title       ← item.title[0]._
  • body        ← item.encoded[0]._   (cleaned of wp:block comments)
  • publishedAt ← new Date(item.pubDate[0]).toISOString()
       │
       ▼
[Batch processor]
  • Sends BATCH_SIZE posts in parallel using Promise.allSettled()
  • Waits DELAY_MS between batches
  • Uses Promise.allSettled (not Promise.all) so one failure
    doesn't stop the entire batch
       │
       ▼
[Shopify GraphQL — articleCreate mutation]
  POST https://{store}/admin/api/{version}/graphql.json
  Header: X-Shopify-Access-Token: {token}
  Body:   { query: mutation, variables: { article: { ... } } }
       │
       ▼
[Result handling]
  • HTTP errors → throw with status code
  • json.errors → GraphQL-level errors (auth, malformed query)
  • userErrors  → Shopify business-logic errors (missing field, etc.)
  • Success → article.id, article.title logged
```

---

## WordPress XML Format (WXR)

WordPress Extended RSS (WXR) is the format produced by WordPress's export tool.

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wfw="http://wellformedweb.org/CommentAPI/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">

  <channel>
    <wp:wxr_version>1.2</wp:wxr_version>

    <item>
      <title>Post Title Here</title>
      <pubDate>Mon, 30 Jun 2025 05:49:49 +0000</pubDate>
      <content:encoded><![CDATA[<p>Full HTML content...</p>]]></content:encoded>
      <wp:post_type><![CDATA[post]]></wp:post_type>
      <wp:status><![CDATA[publish]]></wp:status>
    </item>

    <!-- more <item> elements ... -->
  </channel>
</rss>
```

**Fields we use:**

| XML Field | After stripPrefix | Description |
|---|---|---|
| `<title>` | `title` | Post title |
| `<pubDate>` | `pubDate` | RFC 2822 date |
| `<content:encoded>` | `encoded` | Full HTML body |
| `<wp:post_type>` | `post_type` | "post" = blog post, "page" = page, etc. |
| `<wp:status>` | `status` | "publish" = live, "draft" = not live |

**Fields we ignore:** attachments, comments, pages, navigation menus, custom post types.

---

## Shopify GraphQL API

### Authentication
```
Header: X-Shopify-Access-Token: shpat_xxxxx
```
Token requires scopes: `read_content`, `write_content`

### Mutation Used
```graphql
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
```

### Variables
```json
{
  "article": {
    "blogId":      "gid://shopify/Blog/122489635182",
    "title":       "Post Title",
    "body":        "<p>HTML content...</p>",
    "isPublished": true,
    "publishDate": "2025-06-30T05:49:49.000Z",
    "author":      { "name": "Author Name" }
  }
}
```

### Rate Limiting
Shopify Admin API uses a bucket-based rate limit:
- Each store gets **40 points** in the leaky bucket
- Each mutation costs **~1 point**
- Bucket refills at **2 points/second**

Our BATCH_SIZE=3 with DELAY_MS=1000 means we send 3 mutations then wait 1 second.
At 2 points/sec refill, this keeps us safely within limits.

If you see `Throttled` errors in userErrors, increase DELAY_MS to 2000.

---

## Error Types

| Error Source | Example | Meaning |
|---|---|---|
| HTTP 401 | `Unauthorized` | Token is wrong or revoked |
| HTTP 402 | `Payment Required` | Store needs a paid plan |
| HTTP 429 | `Too Many Requests` | Rate limited — increase DELAY_MS |
| `json.errors` | `Field 'blogId' doesn't exist` | Wrong API version or field name |
| `userErrors` | `[title] can't be blank` | Missing required field in mutation |

---

## Dependencies

| Package | Version | Why |
|---|---|---|
| `xml2js` | ^0.6.2 | Parse WordPress XML with namespace handling |
| `node-fetch` | ^2.7.0 | HTTP client for Shopify API (CommonJS, Node 16 compatible) |

`node-fetch` v2 is used instead of v3 because v3 is ESM-only, which requires
`"type": "module"` in package.json and breaks CommonJS `require()` — unnecessarily
complicating the setup for non-developers.

On Node.js 18+, the script automatically uses the built-in `globalThis.fetch`
and ignores `node-fetch`. On Node.js 16-17, `node-fetch` v2 is used.

---

## Future Improvements (not implemented)

- **Resume capability**: Save progress to a `.json` file so interrupted imports can resume
- **Duplicate detection**: Check if a post with the same title/handle already exists before creating
- **Featured image import**: Download featured images and upload to Shopify CDN
- **Category/tag mapping**: Map WordPress categories to Shopify article tags
- **Multiple blog support**: Route posts to different blogs based on WordPress category
- **Config validation wizard**: Interactive prompt to guide users through setup
