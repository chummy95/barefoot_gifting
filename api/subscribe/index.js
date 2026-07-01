const { cors } = require('../_lib/cors');
const { isConfigured, syncSubscriber } = require('../_lib/mailerlite');

function cleanText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function getRequestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (forwarded) return forwarded;
  return cleanText(req.headers['x-real-ip']);
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isConfigured()) {
    return res.status(503).json({
      error: 'Email signups are not configured yet. Add MAILERLITE_API_KEY in Vercel to enable subscriptions.',
    });
  }

  const email = normalizeEmail(req.body?.email);
  const name = cleanText(req.body?.name);
  const phone = cleanText(req.body?.phone);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  try {
    const result = await syncSubscriber({
      email,
      name,
      phone,
      source: req.body?.source === 'popup' ? 'popup' : 'newsletter',
      status: 'active',
      resubscribe: true,
      optedInAt: new Date(),
      subscribedAt: new Date(),
      optinIp: getRequestIp(req),
      ipAddress: getRequestIp(req),
    });

    return res.status(200).json({
      message: 'You are on the list.',
      synced: !result.skipped,
    });
  } catch (error) {
    return res.status(error.status || 502).json({
      error: error.message || 'We could not save your subscription right now.',
    });
  }
};
