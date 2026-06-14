const { sql } = require('../_lib/db');
const { requireAuth, verifyToken, getTokenFromReq } = require('../_lib/auth');
const { cors } = require('../_lib/cors');
const { getSegments } = require('../_lib/path-segments');

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  const segments = getSegments(req, '/api/orders');

  if (segments.length === 0) {
    if (req.method === 'GET') {
      const user = requireAuth(req, res);
      if (!user) return;

      let rows;
      if (user.role === 'admin') {
        const { status } = req.query;
        const result = status
          ? await sql`SELECT * FROM orders WHERE status = ${status} ORDER BY created_at DESC`
          : await sql`SELECT * FROM orders ORDER BY created_at DESC`;
        rows = result.rows;
      } else {
        const result = await sql`SELECT * FROM orders WHERE user_id = ${user.id} ORDER BY created_at DESC`;
        rows = result.rows;
      }

      const ids = rows.map(r => r.id);
      let items = [];
      if (ids.length) {
        const itemRes = await sql.query(`SELECT * FROM order_items WHERE order_id = ANY($1)`, [ids]);
        items = itemRes.rows;
      }
      return res.status(200).json(rows.map(o => ({ ...o, items: items.filter(i => i.order_id === o.id) })));
    }

    if (req.method === 'POST') {
      const { name, email, phone, address, city, state, country, items, deliveryFee } = req.body || {};
      if (!email || !name || !Array.isArray(items) || !items.length) {
        return res.status(400).json({ error: 'name, email and items are required' });
      }

      const token = getTokenFromReq(req);
      const payload = token ? verifyToken(token) : null;

      const subtotal = items.reduce((sum, it) => sum + Number(it.price) * Number(it.qty || 1), 0);
      const fee = Number(deliveryFee || 0);
      const total = subtotal + fee;

      const { rows } = await sql`
        INSERT INTO orders (user_id, email, name, phone, address, city, state, country, subtotal, delivery_fee, total)
        VALUES (${payload ? payload.id : null}, ${email}, ${name}, ${phone || null}, ${address || null}, ${city || null}, ${state || null}, ${country || null}, ${subtotal}, ${fee}, ${total})
        RETURNING *
      `;
      const order = rows[0];

      for (const it of items) {
        await sql`
          INSERT INTO order_items (order_id, product_id, name, price, qty, image, customization)
          VALUES (${order.id}, ${it.id || null}, ${it.name}, ${it.price}, ${it.qty || 1}, ${it.img || null}, ${it.customization ? JSON.stringify(it.customization) : null})
        `;
      }

      return res.status(201).json(order);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (segments.length === 1) {
    const user = requireAuth(req, res);
    if (!user) return;

    const id = segments[0];
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

      const { rows: updated } = await sql`
        UPDATE orders
        SET status = ${status}, updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
      return res.status(200).json(updated[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(404).json({ error: 'Not found' });
};
