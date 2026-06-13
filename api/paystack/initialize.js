const { sql } = require('../_lib/db');
const { cors } = require('../_lib/cors');

// POST { orderId } -> creates a Paystack transaction and returns the
// authorization_url to redirect the customer to.
module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return res.status(500).json({ error: 'Paystack is not configured (PAYSTACK_SECRET_KEY missing)' });

  const { orderId } = req.body || {};
  if (!orderId) return res.status(400).json({ error: 'orderId is required' });

  const { rows } = await sql`SELECT * FROM orders WHERE id = ${orderId}`;
  const order = rows[0];
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const base = process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`;

  const resp = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: order.email,
      amount: order.total * 100, // kobo
      currency: order.currency || 'NGN',
      callback_url: `${base}/checkout-success.html?order=${order.id}`,
      metadata: { order_id: order.id, name: order.name },
    }),
  });

  const data = await resp.json();
  if (!data.status) return res.status(502).json({ error: data.message || 'Paystack initialization failed' });

  await sql`UPDATE orders SET payment_ref = ${data.data.reference} WHERE id = ${order.id}`;

  return res.status(200).json({
    authorization_url: data.data.authorization_url,
    access_code: data.data.access_code,
    reference: data.data.reference,
  });
};
