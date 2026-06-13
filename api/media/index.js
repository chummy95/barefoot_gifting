const { put } = require('@vercel/blob');
const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { cors } = require('../_lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const user = requireAuth(req, res, ['admin']);
  if (!user) return;

  if (req.method === 'GET') {
    const { rows } = await sql`SELECT * FROM media ORDER BY created_at DESC LIMIT 200`;
    return res.status(200).json(rows);
  }

  if (req.method === 'POST') {
    // Expects JSON: { filename, contentType, dataBase64 }
    // (Simple base64 upload — avoids needing multipart parsing on Vercel functions.)
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

  res.status(405).json({ error: 'Method not allowed' });
};
