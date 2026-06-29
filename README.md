# WordPress → Shopify Blog Importer

A simple command-line tool that reads a WordPress XML export file and
automatically imports all published blog posts into any Shopify store's blog.

**No coding skills required.** Just fill in 5 values in `config.js` and run two commands.

---

## What This Tool Does

1. Reads your WordPress XML export file (`.xml`)
2. Finds all **published** blog posts
3. Cleans up WordPress block-editor markup
4. Imports each post into your Shopify blog with the correct publish date and author
5. Shows you a live progress bar and a final summary

---

## Requirements

You need the following things installed / ready before starting.

| Requirement | What It Is | How to Get It |
|---|---|---|
| **Node.js** (v16 or newer) | The engine that runs this script | https://nodejs.org → click "LTS" → install |
| **WordPress XML export file** | A `.xml` file exported from WordPress | WordPress Admin → Tools → Export → All content |
| **Shopify store** | The store you want to import posts into | Already have one |
| **Shopify Admin API token** | A secret key to connect to your store | See Step 3 below |

---

## Step-by-Step Setup Guide

### STEP 1 — Install Node.js

1. Open your browser and go to **https://nodejs.org**
2. Click the big green **"LTS"** button (recommended version)
3. Download and run the installer
4. Click "Next" through all steps, keep all default settings
5. When done, open **Command Prompt** (press `Win + R`, type `cmd`, press Enter)
6. Type this and press Enter to confirm Node.js is installed:
   ```
   node --version
   ```
   You should see something like `v20.11.0`. If you do, Node.js is ready.

---

### STEP 2 — Export Your WordPress Blog Posts

1. Log in to your **WordPress Admin** (e.g. `yoursite.com/wp-admin`)
2. In the left menu go to **Tools → Export**
3. Select **"All content"**
4. Click **"Download Export File"**
5. You will get a `.xml` file — save it somewhere easy to find
   (e.g. `D:\projects\luxica img\blogs.xml`)

---

### STEP 3 — Create a Shopify Admin API Access Token

This is the most important step. Follow carefully.

1. Log in to your **Shopify Admin** (e.g. `your-store.myshopify.com/admin`)

2. Click **Settings** (bottom-left corner)

3. Click **"Apps and sales channels"** in the left sidebar

4. At the top-right of the page, click **"Develop apps"**
   > If you see a warning "Allow custom app development", click "Allow custom app development" and confirm.

5. Click **"Create an app"**

6. In the popup:
   - **App name**: type `Blog Importer` (or any name you like)
   - **App developer**: your email is auto-filled — leave it
   - Click **"Create app"**

7. You are now on the app detail page. Click **"Configure Admin API scopes"**

8. In the search box, search for `content` and enable:
   - ✅ `write_content`
   - ✅ `read_content`
   - Click **"Save"**

9. Click the **"API credentials"** tab at the top

10. Under **"Admin API access token"**, click **"Reveal token once"**

11. **Copy the token immediately** — it starts with `shpat_`
    > ⚠️ IMPORTANT: You can only see this token ONCE. Copy and save it now.
    > If you lose it, you'll need to create a new app and repeat these steps.

12. Paste the token into `config.js` → `SHOPIFY_ACCESS_TOKEN`

---

### STEP 4 — Open the Folder in Command Prompt

1. Open **File Explorer** and navigate to:
   ```
   D:\projects\luxica img\blog-importer\
   ```

2. Click on the **address bar** at the top of File Explorer (where it shows the folder path)

3. Type `cmd` and press **Enter**
   > A Command Prompt window will open, already in the correct folder.

---

### STEP 5 — Install Dependencies

In the Command Prompt window, type this and press Enter:

```
npm install
```

You will see some text scrolling — this is normal. Wait for it to finish.
When you see `added XX packages`, it is done.

---

### STEP 6 — Edit config.js

Open the file `config.js` in any text editor (Notepad, VS Code, etc.) and fill in:

```js
XML_FILE_PATH:        'D:/projects/luxica img/blogs.xml',  // path to your XML file
SHOPIFY_STORE_URL:    'your-store.myshopify.com',          // your store domain
SHOPIFY_ACCESS_TOKEN: 'shpat_xxxxxxxxxxxxxxxxxxxxxxxx',    // token from Step 3
BLOG_ID:              'gid://shopify/Blog/XXXXXXXXXXXX',   // see Step 7 below
AUTHOR_NAME:          'Your Store Name',                   // author shown on posts
```

> **Path tip for Windows:** Use forward slashes `/` in the file path, not backslashes `\`.
> Correct: `'D:/projects/luxica img/blogs.xml'`
> Wrong: `'D:\projects\luxica img\blogs.xml'`

---

### STEP 7 — Find Your Blog ID

You need the ID of the specific blog where posts will be imported.

In your Command Prompt, run:

```
node list-blogs.js
```

You will see output like:

```
┌──────────────────────────────────────────────┬────────────────────┬──────────────────────┐
│ Blog ID                                      │ Handle             │ Title                │
├──────────────────────────────────────────────┼────────────────────┼──────────────────────┤
│ gid://shopify/Blog/122489635182              │ news               │ News                 │
│ gid://shopify/Blog/100000000099              │ tips               │ Tips & Tricks        │
└──────────────────────────────────────────────┴────────────────────┴──────────────────────┘
```

Copy the **Blog ID** for the blog you want (e.g. `gid://shopify/Blog/122489635182`)
and paste it into `config.js` → `BLOG_ID`.

---

### STEP 8 — Preview (Dry Run)

Before importing anything, do a test run to confirm everything is set up correctly.
This will show you what will be imported WITHOUT actually creating any posts.

```
node import.js --dry-run
```

Expected output:
```
📂  XML file  : D:/projects/luxica img/blogs.xml
    File size : 1200.4 KB
    Total XML items  : 58
    Published posts  : 51

📋  Posts to be imported:
     1. [2025-06-30]  Why Choose Lab Grown Diamond Over Natural Diamond?
     2. [2025-07-10]  What Are The Benefits Of Lab-Grown Diamonds?
     ...

✅  DRY RUN complete. 51 post(s) would be imported.
    Run without --dry-run to actually import.
```

If you see errors here, check the Troubleshooting section below.

---

### STEP 9 — Run the Import

When everything looks correct, run:

```
node import.js
```

You will see a live progress display:

```
🚀  Importing to : https://luxicajewels.myshopify.com
    Blog ID      : gid://shopify/Blog/122489635182
    Author       : Luxica Jewels
    Batch size   : 3
    Total posts  : 51

   Batch   1/17  ✅ ✅ ✅   [3/51]
   Batch   2/17  ✅ ✅ ✅   [6/51]
   ...
   Batch  17/17  ✅ ✅      [51/51]

╔══════════════════════════════════════════════╗
║                   SUMMARY                   ║
╚══════════════════════════════════════════════╝
   ✅  Imported successfully : 51 post(s)
   ❌  Failed                : 0 post(s)

   🔗  View your blog at:
       https://luxicajewels.myshopify.com/blogs/news
```

The import is complete! Open the link to see your posts in Shopify.

---

## Importing a Different XML File Next Time

Just edit the `XML_FILE_PATH` in `config.js` to point to the new file and run `node import.js` again. Everything else stays the same.

---

## Command Reference

| Command | What It Does |
|---|---|
| `npm install` | Install required packages (run once after downloading) |
| `node list-blogs.js` | List all blog IDs in your Shopify store |
| `node import.js --dry-run` | Preview what will be imported (safe — nothing is created) |
| `node import.js` | Import all published posts |
| `node import.js --limit=5` | Import only the first 5 posts (good for testing) |

---

## Troubleshooting

### ❌ "node is not recognized as a command"
Node.js is not installed or not in your PATH.
→ Re-install Node.js from https://nodejs.org and restart Command Prompt.

### ❌ "config.js not found"
You are running the command from the wrong folder.
→ Make sure you `cd` into the `blog-importer` folder first, or use the address bar trick from Step 4.

### ❌ "File not found" (for the XML file)
The path in `XML_FILE_PATH` is wrong.
→ In File Explorer, hold **Shift** and right-click the XML file → "Copy as path".
→ Paste into `XML_FILE_PATH` and replace all `\` with `/`.

### ❌ "Authentication failed (401 Unauthorized)"
Your `SHOPIFY_ACCESS_TOKEN` is wrong or expired.
→ Create a new token following Step 3 again.

### ❌ "No published blog posts found"
Your XML file has no posts with `post_type = post` and `status = publish`.
→ In WordPress, make sure you exported "All content" (not just "Posts").
→ Run `node import.js --dry-run` to see what the parser finds.

### ❌ Some posts show ❌ (failed) in the progress
This can happen due to Shopify rate limits.
→ Open `config.js` and change `DELAY_MS` from `1000` to `2000`.
→ Run `node import.js` again — duplicate posts in Shopify can be deleted manually.

### ❌ Posts imported but content is empty
The XML file might be using a different encoding.
→ Open the XML in a text editor and check that you can see the post content.
→ Make sure the file is a proper WordPress WXR export.

---

## Files in This Folder

```
blog-importer/
├── config.js        ← YOU ONLY NEED TO EDIT THIS FILE
├── import.js        ← Main import script (do not edit)
├── list-blogs.js    ← Helper to find blog IDs (do not edit)
├── package.json     ← Package metadata (do not edit)
├── README.md        ← This guide
└── plan.md          ← Technical architecture document
```

After running `npm install`, a `node_modules/` folder will also appear — that is normal, do not delete it.

---

## Security Notes

- Your `SHOPIFY_ACCESS_TOKEN` is a secret. Do **not** share `config.js` with anyone.
- The token only has `read_content` and `write_content` permissions — it cannot access orders, customers, or payments.
- If you ever share this folder with someone, delete your token from `config.js` first and generate a new one from Shopify Admin.
