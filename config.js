/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║           CONFIGURATION FILE — EDIT THIS FILE ONLY          ║
 * ║                                                              ║
 * ║  Fill in the values below and you are done.                  ║
 * ║  Do NOT touch import.js or list-blogs.js.                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

module.exports = {

  // ──────────────────────────────────────────────────────────────
  // 1. PATH TO YOUR WORDPRESS XML FILE
  //    Use forward slashes (/) even on Windows.
  //    Examples:
  //      'C:/Users/YourName/Downloads/blogs.xml'
  //      'D:/projects/luxica img/blogs.xml'
  //      './blogs.xml'   ← if the file is inside this folder
  // ──────────────────────────────────────────────────────────────
  XML_FILE_PATH: 'D:/projects/luxica img/blogs.xml',

  // ──────────────────────────────────────────────────────────────
  // 2. YOUR SHOPIFY STORE URL
  //    Only the domain — no https:// and no trailing slash.
  //    Example: 'luxicajewels.myshopify.com'
  // ──────────────────────────────────────────────────────────────
  SHOPIFY_STORE_URL: 'luxicajewels.myshopify.com',

  // ──────────────────────────────────────────────────────────────
  // 3. SHOPIFY ADMIN API ACCESS TOKEN
  //    Starts with 'shpat_'
  //    See README.md → Step 3 for how to create this.
  // ──────────────────────────────────────────────────────────────
  SHOPIFY_ACCESS_TOKEN: 'YOUR_ACCESS_TOKEN_HERE',

  // ──────────────────────────────────────────────────────────────
  // 4. BLOG ID  (where posts will be added)
  //    Run `node list-blogs.js` to see all your blog IDs.
  //    Example: 'gid://shopify/Blog/122489635182'
  // ──────────────────────────────────────────────────────────────
  BLOG_ID: 'gid://shopify/Blog/122489635182',

  // ──────────────────────────────────────────────────────────────
  // 5. AUTHOR NAME shown on each imported blog post
  // ──────────────────────────────────────────────────────────────
  AUTHOR_NAME: 'Luxica Jewels',

  // ══════════════════════════════════════════════════════════════
  //  ADVANCED SETTINGS — only change if you know what you're doing
  // ══════════════════════════════════════════════════════════════

  // How many posts to send to Shopify at the same time.
  // Keep between 1 and 5. Higher = faster but more likely to hit rate limits.
  BATCH_SIZE: 3,

  // Wait time (in milliseconds) between each batch.
  // 1000 ms = 1 second. Increase to 2000 if you see rate limit errors.
  DELAY_MS: 1000,

  // Shopify API version — change only if Shopify releases a newer version
  API_VERSION: '2024-01',
};
