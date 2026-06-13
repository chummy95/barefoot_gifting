const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { cors } = require('../_lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const payload = requireAuth(req, res);
  if (!payload) return;

  if (req.method === 'GET') {
    const { rows } = await sql`SELECT id, name, email, role, phone, address, created_at FROM users WHERE id = ${payload.id}`;
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    return res.status(200).json(rows[0]);
  }

  if (req.method === 'PUT') {
    const { name, phone, address } = req.body || {};
    const { rows } = await sql`
      UPDATE users SET name = COALESCE(${name}, name), phone = COALESCE(${phone}, phone), address = COALESCE(${address}, address)
      WHERE id = ${payload.id}
      RETURNING id, name, email, role, phone, address
    `;
    return res.status(200).json(rows[0]);
  }

  res.status(405).json({ error: 'Method not allowed' });
};
