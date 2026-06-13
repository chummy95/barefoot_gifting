const { del } = require('@vercel/blob');
const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { cors } = require('../_lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const user = requireAuth(req, res, ['admin']);
  if (!user) return;
  const { id } = req.query;

  if (req.method === 'DELETE') {
    const { rows } = await sql`SELECT * FROM media WHERE id = ${id}`;
    const item = rows[0];
    if (!item) return res.status(404).json({ error: 'Not found' });

    try { await del(item.url); } catch (e) { /* ignore if already gone */ }
    await sql`DELETE FROM media WHERE id = ${id}`;
    return res.status(204).end();
  }

  if (req.method === 'PATCH') {
    const { alt } = req.body || {};
    const { rows } = await sql`UPDATE media SET alt = ${alt} WHERE id = ${id} RETURNING *`;
    return res.status(200).json(rows[0]);
  }

  res.status(405).json({ error: 'Method not allowed' });
};
