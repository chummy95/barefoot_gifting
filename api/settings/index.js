const { sql } = require('../_lib/db');
const { requireAuth, verifyToken, getTokenFromReq } = require('../_lib/auth');
const { cors } = require('../_lib/cors');

// Public, non-secret settings the storefront needs (e.g. Paystack public key,
// delivery fees). The Paystack SECRET key is never stored/returned here — it
// only ever lives in the PAYSTACK_SECRET_KEY environment variable.
const PUBLIC_KEYS = ['paystack_public_key', 'paystack_enabled', 'free_delivery_threshold', 'delivery_fee', 'store_name'];

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  if (req.method === 'GET') {
    const token = getTokenFromReq(req);
    const payload = token ? verifyToken(token) : null;
    const isAdmin = payload && payload.role === 'admin';

    const { rows } = await sql`SELECT key, value FROM settings`;
    const out = {};
    for (const r of rows) {
      if (isAdmin || PUBLIC_KEYS.includes(r.key)) out[r.key] = r.value;
    }
    if (isAdmin) {
      out.paystack_secret_key_set = !!process.env.PAYSTACK_SECRET_KEY;
    }
    return res.status(200).json(out);
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;

    const updates = req.body || {};
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'paystack_secret_key') continue; // never store the secret key in the DB
      await sql`
        INSERT INTO settings (key, value) VALUES (${key}, ${String(value)})
        ON CONFLICT (key) DO UPDATE SET value = ${String(value)}
      `;
    }
    const { rows } = await sql`SELECT key, value FROM settings`;
    const out = {};
    for (const r of rows) out[r.key] = r.value;
    return res.status(200).json(out);
  }

  res.status(405).json({ error: 'Method not allowed' });
};
