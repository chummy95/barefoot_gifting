const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { cors } = require('../_lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const user = requireAuth(req, res, ['admin']);
  if (!user) return;

  if (req.method === 'GET') {
    const { rows } = await sql`
      SELECT u.id, u.name, u.email, u.phone, u.created_at,
             COUNT(o.id)::int AS order_count,
             COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid'), 0)::int AS total_spent
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      WHERE u.role = 'customer'
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `;
    return res.status(200).json(rows);
  }

  res.status(405).json({ error: 'Method not allowed' });
};
