const crypto = require('crypto');
const { sql } = require('../_lib/db');
const { cors } = require('../_lib/cors');

module.exports.config = { api: { bodyParser: false } };

function getAction(req) {
  const value = req.query && req.query.action;
  return Array.isArray(value) ? value[0] : value;
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function parseJsonBody(req) {
  const raw = await readRawBody(req);
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('Invalid JSON body');
    error.statusCode = 400;
    throw error;
  }
}

async function handleInitialize(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ error: 'Paystack is not configured (PAYSTACK_SECRET_KEY missing)' });
  }

  const body = await parseJsonBody(req);
  const { orderId } = body || {};
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
      amount: order.total * 100,
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
}

async function handleVerify(req, res) {
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

  return res.status(200).json({
    paid,
    order: rows[0] || null,
    paystack: { status: tx.status, amount: tx.amount },
  });
}

async function handleWebhook(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const secret = process.env.PAYSTACK_SECRET_KEY;
  const raw = await readRawBody(req);

  const signature = req.headers['x-paystack-signature'];
  const expected = crypto.createHmac('sha512', secret || '').update(raw).digest('hex');
  if (!secret || signature !== expected) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = raw ? JSON.parse(raw) : {};

  if (event.event === 'charge.success') {
    const reference = event.data.reference;
    await sql`
      UPDATE orders SET payment_status = 'paid', status = 'paid', updated_at = now()
      WHERE payment_ref = ${reference}
    `;
  }

  return res.status(200).json({ received: true });
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  const action = getAction(req);

  try {
    if (action === 'initialize') return await handleInitialize(req, res);
    if (action === 'verify') return await handleVerify(req, res);
    if (action === 'webhook') return await handleWebhook(req, res);
    return res.status(404).json({ error: 'Not found' });
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    return res.status(statusCode).json({ error: error.message || 'Request failed' });
  }
};
