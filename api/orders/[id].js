const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { cors } = require('../_lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const user = requireAuth(req, res);
  if (!user) return;
  const { id } = req.query;

  const { rows } = await sql`SELECT * FROM orders WHERE id = ${id}`;
  const order = rows[0];
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (user.role !== 'admin' && order.user_id !== user.id) return res.status(403).json({ error: 'Forbidden' });

  if (req.method === 'GET') {
    const { rows: items } = await sql`SELECT * FROM order_items WHERE order_id = ${id}`;
    return res.status(200).json({ ...order, items });
  }

  if (req.method === 'PATCH' || req.method === 'PUT') {
    if (user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { status } = req.body || {};
    const allowed = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'failed'];
    if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });

    const { rows: updated } = await sql`UPDATE orders SET status = ${status}, updated_at = now() WHERE id = ${id} RETURNING *`;
    return res.status(200).json(updated[0]);
  }

  res.status(405).json({ error: 'Method not allowed' });
};
