const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { cors } = require('../_lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const user = requireAuth(req, res, ['admin']);
  if (!user) return;
  const { id } = req.query;

  if (req.method === 'PATCH') {
    const { status } = req.body || {};
    const allowed = ['pending', 'approved', 'spam', 'trash'];
    if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    const { rows } = await sql`UPDATE comments SET status = ${status} WHERE id = ${id} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(rows[0]);
  }

  if (req.method === 'DELETE') {
    await sql`DELETE FROM comments WHERE id = ${id}`;
    return res.status(204).end();
  }

  res.status(405).json({ error: 'Method not allowed' });
};
