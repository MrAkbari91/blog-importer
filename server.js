'use strict';

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const { listBlogs, runImport } = require('./importer');

const app    = express();
const storage = multer.memoryStorage();
const upload  = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── List blogs ────────────────────────────────────────────────
app.post('/api/list-blogs', async (req, res) => {
  const { storeUrl, token } = req.body;

  if (!storeUrl || !token) {
    return res.status(400).json({ error: 'storeUrl and token are required.' });
  }

  try {
    const blogs = await listBlogs(storeUrl.trim(), token.trim());
    res.json({ blogs });
  } catch (err) {
    const status = err.status === 401 ? 401 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ── Import via SSE ────────────────────────────────────────────
app.post('/api/import', upload.single('xmlFile'), (req, res) => {
  const { storeUrl, token, blogId, authorName, batchSize, delayMs } = req.body;

  // Validate
  if (!storeUrl || !token || !blogId || !authorName) {
    return res.status(400).json({ error: 'storeUrl, token, blogId, and authorName are required.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'XML file is required.' });
  }
  if (!req.file.originalname.toLowerCase().endsWith('.xml')) {
    return res.status(400).json({ error: 'Uploaded file must be a .xml file.' });
  }

  // SSE headers
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  function send(type, data) {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  }

  runImport(
    {
      storeUrl:   storeUrl.trim(),
      token:      token.trim(),
      blogId:     blogId.trim(),
      authorName: authorName.trim(),
      xmlBuffer:  req.file.buffer,
      batchSize:  parseInt(batchSize, 10) || 3,
      delayMs:    parseInt(delayMs, 10)   || 1000,
    },
    (type, data) => send(type, data)
  ).then(() => {
    res.end();
  }).catch(err => {
    send('error', { msg: err.message });
    res.end();
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Blog Importer UI running at:  http://localhost:${PORT}\n`);
});
