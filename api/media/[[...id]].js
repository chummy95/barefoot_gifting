const fs = require('fs');
const path = require('path');
const { put } = require('@vercel/blob');
const { del } = require('@vercel/blob');
const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { cors } = require('../_lib/cors');
const { getSegments } = require('../_lib/path-segments');

const SITE_MEDIA_DIRS = ['PRODUCTS', 'mockup', 'Png Files', 'Jpeg Files', 'SVG'];
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

function walkDir(dirPath, fileList = []) {
  if (!fs.existsSync(dirPath)) return fileList;

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, fileList);
      continue;
    }
    fileList.push(fullPath);
  }

  return fileList;
}

function humanizeFilename(filename) {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getMimeType(ext) {
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    default: return null;
  }
}

function getSiteMedia() {
  const root = process.cwd();
  const assets = [];

  for (const dirName of SITE_MEDIA_DIRS) {
    const absoluteDir = path.join(root, dirName);
    const files = walkDir(absoluteDir);

    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;

      const relativePath = path.relative(root, filePath).replace(/\\/g, '/');
      const stat = fs.statSync(filePath);
      assets.push({
        id: `site:${relativePath}`,
        url: encodeURI(`/${relativePath}`),
        filename: path.basename(filePath),
        mime_type: getMimeType(ext),
        size_bytes: stat.size,
        alt: humanizeFilename(path.basename(filePath)),
        uploaded_by: null,
        created_at: stat.mtime.toISOString(),
        kind: 'site',
        source: 'site',
        readonly: true,
      });
    }
  }

  assets.sort((a, b) => a.filename.localeCompare(b.filename));
  return assets;
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  const user = requireAuth(req, res, ['admin']);
  if (!user) return;

  const segments = getSegments(req, '/api/media');

  if (segments.length === 0) {
    if (req.method === 'GET') {
      const { rows } = await sql`SELECT * FROM media ORDER BY created_at DESC LIMIT 200`;
      const uploads = rows.map(row => ({
        ...row,
        kind: 'uploaded',
        source: 'uploads',
        readonly: false,
      }));
      return res.status(200).json([...uploads, ...getSiteMedia()]);
    }

    if (req.method === 'POST') {
      const { filename, contentType, dataBase64, alt } = req.body || {};
      if (!filename || !dataBase64) return res.status(400).json({ error: 'filename and dataBase64 are required' });

      const buffer = Buffer.from(dataBase64, 'base64');
      const blob = await put(`media/${Date.now()}-${filename}`, buffer, {
        access: 'public',
        contentType: contentType || 'application/octet-stream',
      });

      const { rows } = await sql`
        INSERT INTO media (url, filename, mime_type, size_bytes, alt, uploaded_by)
        VALUES (${blob.url}, ${filename}, ${contentType || null}, ${buffer.length}, ${alt || null}, ${user.id})
        RETURNING *
      `;
      return res.status(201).json(rows[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (segments.length === 1) {
    const id = segments[0];

    if (req.method === 'DELETE') {
      const { rows } = await sql`SELECT * FROM media WHERE id = ${id}`;
      const item = rows[0];
      if (!item) return res.status(404).json({ error: 'Not found' });

      try {
        await del(item.url);
      } catch (e) {
        // Ignore deletes for blobs that were already removed upstream.
      }
      await sql`DELETE FROM media WHERE id = ${id}`;
      return res.status(204).end();
    }

    if (req.method === 'PATCH') {
      const { alt } = req.body || {};
      const { rows } = await sql`UPDATE media SET alt = ${alt} WHERE id = ${id} RETURNING *`;
      return res.status(200).json(rows[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(404).json({ error: 'Not found' });
};
