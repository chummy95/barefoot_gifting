const { put } = require('@vercel/blob');
const { del } = require('@vercel/blob');
const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { cors } = require('../_lib/cors');
const { getSegments } = require('../_lib/path-segments');
const siteMediaManifest = require('../_lib/site-media-manifest.json');

function getSiteMedia() {
  return siteMediaManifest;
}

function isBlobUrl(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  try {
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
          storage_kind: String(row.url || '').startsWith('data:') ? 'inline' : 'blob',
        }));
        return res.status(200).json([...uploads, ...getSiteMedia()]);
      }

      if (req.method === 'POST') {
        const { filename, contentType, dataBase64, alt } = req.body || {};
        if (!filename || !dataBase64) return res.status(400).json({ error: 'filename and dataBase64 are required' });

        const buffer = Buffer.from(dataBase64, 'base64');
        const mimeType = contentType || 'application/octet-stream';

        let finalUrl = null;
        let storageKind = 'blob';

        try {
          const blob = await put(`media/${Date.now()}-${filename}`, buffer, {
            access: 'public',
            contentType: mimeType,
          });
          finalUrl = blob.url;
        } catch (error) {
          if (!mimeType.startsWith('image/')) {
            throw error;
          }
          if (buffer.length > 2 * 1024 * 1024) {
            return res.status(413).json({ error: 'Image is still too large after optimization. Please try a smaller image.' });
          }
          finalUrl = `data:${mimeType};base64,${dataBase64}`;
          storageKind = 'inline';
        }

        const { rows } = await sql`
          INSERT INTO media (url, filename, mime_type, size_bytes, alt, uploaded_by)
          VALUES (${finalUrl}, ${filename}, ${mimeType || null}, ${buffer.length}, ${alt || null}, ${user.id})
          RETURNING *
        `;
        return res.status(201).json({ ...rows[0], storage_kind: storageKind });
      }

      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (segments.length === 1) {
      const id = segments[0];

      if (req.method === 'DELETE') {
        const { rows } = await sql`SELECT * FROM media WHERE id = ${id}`;
        const item = rows[0];
        if (!item) return res.status(404).json({ error: 'Not found' });

        if (isBlobUrl(item.url)) {
          try {
            await del(item.url);
          } catch (e) {
            // Ignore deletes for blobs that were already removed upstream.
          }
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
  } catch (error) {
    console.error('media api error', error);
    return res.status(500).json({ error: error?.message || 'Media request failed' });
  }
};
