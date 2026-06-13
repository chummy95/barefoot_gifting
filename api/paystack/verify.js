const { sql } = require('../_lib/db');
const { cors } = require('../_lib/cors');

// GET /api/paystack/verify?reference=xxx
// Called from checkout-success.html to confirm payment and mark the order paid.
module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return res.status(500).json({ error: 'Paystack is not configured' });

  const { reference } = req.query;
  if (!reference) return res.status(400).json({ error: 'reference is required' });

  const resp = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const data = await resp.json();
  if (!data.status) return res.status(502).json({ error: data.message || 'Verification failed' });

  const tx = data.data;
  const paid = tx.status === 'success';

  const { rows } = await sql`
    UPDATE orders SET
      payment_status = ${paid ? 'paid' : 'failed'},
      status = ${paid ? 'paid' : 'failed'},
      updated_at = now()
    WHERE payment_ref = ${reference}
    RETURNING *
  `;

  return res.status(200).json({ paid, order: rows[0] || null, paystack: { status: tx.status, amount: tx.amount } });
};
