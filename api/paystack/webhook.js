const crypto = require('crypto');
const { sql } = require('../_lib/db');

// Paystack webhook — configure this URL in Paystack Dashboard → Settings → API Keys & Webhooks:
//   https://your-site.vercel.app/api/paystack/webhook
//
// Body parsing is disabled so we can verify the HMAC signature against the raw payload.
module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const secret = process.env.PAYSTACK_SECRET_KEY;
  const raw = await readRawBody(req);

  const signature = req.headers['x-paystack-signature'];
  const expected = crypto.createHmac('sha512', secret || '').update(raw).digest('hex');
  if (!secret || signature !== expected) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(raw);

  if (event.event === 'charge.success') {
    const reference = event.data.reference;
    await sql`
      UPDATE orders SET payment_status = 'paid', status = 'paid', updated_at = now()
      WHERE payment_ref = ${reference}
    `;
  }

  return res.status(200).json({ received: true });
};
