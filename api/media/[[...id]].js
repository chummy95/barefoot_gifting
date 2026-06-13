const { put } = require('@vercel/blob');
const { del } = require('@vercel/blob');
const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { cors } = require('../_lib/cors');

function getSegments(queryValue) {
  if (!queryValue) return [];
  return Array.isArray(queryValue) ? queryValue : [queryValue];
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  const user = requireAuth(req, res, ['admin']);
  if (!user) return;

  const segments = getSegments(req.query.id);

  if (segments.length === 0) {
    if (req.method === 'GET') {
      const { rows } = await sql`SELECT * FROM media ORDER BY created_at DESC LIMIT 200`;
      return res.status(200).json(rows);
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
