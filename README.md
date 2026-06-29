# WordPress → Shopify Blog Importer

A **web-based** migration tool that imports all your published WordPress blog posts into any Shopify store — with a premium UI, real-time progress, and smart duplicate detection.

No coding required. Open a browser, fill in a few fields, click Import.

---

## What It Does

- Reads your WordPress XML export (`.xml`) and finds every **published** post
- Cleans up WordPress block-editor comments from the HTML
- Checks your Shopify blog for existing posts and **upserts** (create new, update duplicates — never doubles up)
- Streams real-time progress back to your browser via Server-Sent Events
- Shows a live log, stats dashboard, and a final result summary

---

## Requirements

| Requirement | Minimum | How to get it |
|---|---|---|
| **Node.js** | v16 or newer | https://nodejs.org → click **LTS** |
| **WordPress XML export** | Any size up to 50 MB | WordPress Admin → Tools → Export |
| **Shopify store** | Any plan | Already have one |
| **Shopify Admin API token** | `write_content` + `read_content` scopes | See Step 2 below |

---

## Quick Start (3 commands)

```bash
# 1. Install dependencies
npm install

# 2. Start the web server
npm start

# 3. Open in your browser
# → http://localhost:3000
```

Then follow the 3 on-screen steps in the UI.

---

## Full Setup Guide

### STEP 1 — Install Node.js

Skip this if you already have Node.js v16+.

1. Go to **https://nodejs.org**
2. Click the big **"LTS"** button and download the installer
3. Run the installer — click **Next** through all steps, keep all defaults
4. Open a terminal / Command Prompt and verify:

```bash
node --version
# Should print something like: v20.11.0
```

---

### STEP 2 — Create a Shopify Admin API Token

> This is the only "technical" step. It takes about 5 minutes.

1. Log in to your **Shopify Admin** — `https://your-store.myshopify.com/admin`

2. Click **Settings** (bottom-left corner of the admin)

3. In the left sidebar click **"Apps and sales channels"**

4. At the top-right of that page click **"Develop apps"**
   > If prompted with *"Allow custom app development"*, click **Allow** and confirm.

5. Click **"Create an app"**
   - **App name**: `Blog Importer` (or any name you like)
   - **App developer**: your email — leave as-is
   - Click **"Create app"**

6. On the new app's page, click **"Configure Admin API scopes"**

7. In the search box type `content` and enable both:
   - ✅ `write_content`
   - ✅ `read_content`
   - Click **"Save"**

8. Click the **"API credentials"** tab

9. Under **"Admin API access token"** click **"Reveal token once"**

10. **Copy the token immediately** — it starts with `shpat_`
    > ⚠️ You can only see this token **once**. Paste it somewhere safe right now.
    > If you lose it, delete the app and create a new one (steps 5–10).

---

### STEP 3 — Export Your WordPress Posts

1. Log in to your **WordPress Admin** — `https://your-site.com/wp-admin`
2. In the left menu go to **Tools → Export**
3. Select **"All content"**
4. Click **"Download Export File"**
5. You will receive a `.xml` file — note where it saves (e.g. `Downloads/mysite.wordpress.xml`)

---

### STEP 4 — Install & Start the Tool

Open a terminal in the `blog-importer` folder and run:

```bash
npm install
npm start
```

You should see:

```
  Blog Importer UI running at:  http://localhost:3000
```

Open **http://localhost:3000** in your browser.

---

### STEP 5 — Use the Web UI

The UI walks you through 3 steps. Here is what each one asks for:

#### Step 1 — Store Credentials

| Field | What to enter | Example |
|---|---|---|
| **Store URL** | Your `.myshopify.com` domain — no `https://`, no trailing slash | `luxicajewels.myshopify.com` |
| **Admin API Access Token** | The `shpat_` token you copied in Step 2 | `shpat_abc123...` |

Click **"Fetch Blogs"** after filling these in. The tool connects to your store and loads your available blogs.

#### Step 2 — Blog & Author

| Field | What to enter |
|---|---|
| **Author Name** | The name that will appear as the author on all imported posts (e.g. your store name) |
| **Destination Blog** | Select from the dropdown — populated after clicking Fetch Blogs |

#### Step 3 — WordPress Export File

- Click the upload zone or drag-and-drop your `.xml` file onto it
- Only `.xml` files are accepted, max 50 MB
- Once selected, a file preview card appears with the filename and size

Click **"Start Import"** — progress appears live on screen.

---

### STEP 6 — Monitor the Import

While importing you will see:

| Element | What it shows |
|---|---|
| **Stats row** | Total posts · Processed · Created · Updated · Failed |
| **Progress bar** | Percentage complete, updated per batch |
| **Live Log** | Timestamped log of every batch and any errors |

When the import finishes, a result card appears:
- 🎉 **All good** — all posts migrated successfully
- ⚠️ **Partial** — some posts imported, some failed (list of failures shown)
- ❌ **Failed** — check the log for the error detail

You can **Download Log** as a `.txt` file for your records.

---

## Advanced Settings

Expand **"Advanced Settings"** below the upload zone to tune:

| Setting | Default | When to change |
|---|---|---|
| **Batch Size** | `3` | Lower to `1` if you hit persistent rate-limit errors |
| **Batch Delay (ms)** | `1000` | Raise to `2000`–`3000` if Shopify returns 429 errors |

---

## How Duplicate Detection Works

Before importing, the tool fetches **all existing article titles** from your chosen Shopify blog. For each WordPress post:

- **Title not found in Shopify** → creates a new article
- **Title already exists in Shopify** → updates the existing article (body, date, author)

This means you can safely re-run the import if something fails partway through — it will not create duplicate posts.

---

## Troubleshooting

### "node is not recognized" / "npm is not recognized"
Node.js is not installed or not in your system PATH.
→ Re-install Node.js from https://nodejs.org and **restart** your terminal.

### "Authentication failed (401)"
Your access token is wrong, expired, or was not copied fully.
→ Go back to Shopify Admin → Settings → Apps → your app → API credentials and reveal a new token.
→ Make sure you're entering only the token value (starting with `shpat_`), not the whole URL.

### Fetch Blogs returns "No blogs found"
Your store has no blogs yet.
→ In Shopify Admin go to **Online Store → Blog Posts → Manage blogs → Add blog**, create one, then click Fetch Blogs again.

### "Only .xml files are accepted"
You may have downloaded the wrong file, or WordPress zipped the export.
→ Go to your Downloads folder, find the file, and check the extension. If it is `.zip`, extract it first — the `.xml` is inside.

### Posts imported but content is empty or garbled
The XML might use a non-UTF-8 encoding.
→ Open the XML in a text editor (VS Code, Notepad++) and check that the post content is readable.
→ Make sure you used **WordPress Admin → Tools → Export** and not a third-party plugin export.

### Some posts show ❌ Failed
Usually a Shopify rate-limit (429) or a field validation error.
→ Open **Advanced Settings** and increase **Batch Delay** to `2000`.
→ Check the failed post list in the result card — the exact error is listed next to each post.
→ Click **"Start New Import"** and re-run — already-imported posts will be skipped (upsert logic).

### "Network error — is the server running?"
The `npm start` process stopped or was not started.
→ Go back to your terminal and check if it is still running. If not, run `npm start` again.

### Port 3000 already in use
Another process is using port 3000.
→ Set a different port: `PORT=3001 npm start` (Mac/Linux) or `set PORT=3001 && npm start` (Windows cmd).
→ Then open `http://localhost:3001`.

---

## Project Structure

```
blog-importer/
├── server.js        ← Express web server + API routes
├── importer.js      ← XML parsing + Shopify GraphQL logic
├── public/
│   └── index.html   ← The web UI (single file, no build step)
├── package.json
└── README.md        ← This guide
```

After running `npm install`, a `node_modules/` folder is created — that is normal, do not delete it.

---

## API Endpoints (for developers)

The server exposes two endpoints used by the UI:

### `POST /api/list-blogs`
Fetches all blogs from a Shopify store.

**Request body (JSON):**
```json
{ "storeUrl": "yourstore.myshopify.com", "token": "shpat_..." }
```

**Response:**
```json
{ "blogs": [{ "id": "gid://shopify/Blog/123", "title": "News", "handle": "news" }] }
```

### `POST /api/import`
Accepts `multipart/form-data` and streams import progress as Server-Sent Events.

**Form fields:**
| Field | Type | Description |
|---|---|---|
| `storeUrl` | string | Shopify store domain |
| `token` | string | Admin API access token |
| `blogId` | string | Target blog GID |
| `authorName` | string | Author name for all posts |
| `xmlFile` | file | WordPress XML export |
| `batchSize` | number | Posts per batch (default: 3) |
| `delayMs` | number | Delay between batches in ms (default: 1000) |

**SSE event types streamed back:**

| Event type | Payload fields |
|---|---|
| `log` | `msg` |
| `parse` | `totalItems`, `postCount` |
| `batch_start` | `batchNum`, `totalBatches`, `from`, `to`, `total` |
| `batch_done` | `batchNum`, `totalBatches`, `done`, `total`, `createdCount`, `updatedCount`, `failCount`, `results[]` |
| `error` | `msg` |
| `done` | `created`, `updated`, `failed`, `failedPosts[]` |

---

## Security Notes

- Your Admin API token is sent only to your own server running locally — it never goes to any third party.
- The token's scopes are limited to `read_content` and `write_content` — it cannot access orders, customers, payments, or any other store data.
- Do not commit the token to source control. If you share this folder, remove the token from any saved forms first.
- The server only listens on `localhost` by default. It is not exposed to the internet unless you intentionally forward the port.

---

## License

MIT — free to use, modify, and distribute.
