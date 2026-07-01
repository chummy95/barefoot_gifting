const { sql } = require('../_lib/db');
const { requireAuth, verifyToken, getTokenFromReq } = require('../_lib/auth');
const { cors } = require('../_lib/cors');

// Public, non-secret settings the storefront needs (e.g. Paystack public key,
// delivery fees). The Paystack SECRET key is never stored/returned here — it
// only ever lives in the PAYSTACK_SECRET_KEY environment variable.
const PUBLIC_KEYS = ['paystack_public_key', 'paystack_enabled', 'free_delivery_threshold', 'delivery_fee', 'store_name'];
const INSTAGRAM_APP_ID = '936619743392459';
const DEFAULT_INSTAGRAM_USERNAME = 'barefootgifting';

function clampCount(value) {
  const count = Number.parseInt(value, 10);
  if (Number.isNaN(count)) return 6;
  return Math.max(1, Math.min(12, count));
}

function getBestCandidate(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  return candidates.reduce((best, candidate) => {
    if (!best) return candidate;
    return (candidate.width || 0) > (best.width || 0) ? candidate : best;
  }, null);
}

function getItemImage(item) {
  const primary = getBestCandidate(item?.image_versions2?.candidates);
  if (primary?.url) return primary.url;

  const carouselImage = getBestCandidate(item?.carousel_media?.[0]?.image_versions2?.candidates);
  if (carouselImage?.url) return carouselImage.url;

  return item?.thumbnail_url || null;
}

function getItemCaption(item) {
  return item?.caption?.text || '';
}

function getPermalink(item) {
  const shortcode = item?.code;
  if (!shortcode) return null;
  const type = item?.product_type === 'clips' ? 'reel' : 'p';
  return `https://www.instagram.com/${type}/${shortcode}/`;
}

async function handleInstagramFeed(req, res) {
  const username = String(req.query.username || DEFAULT_INSTAGRAM_USERNAME).trim().replace(/^@/, '') || DEFAULT_INSTAGRAM_USERNAME;
  const count = clampCount(req.query.count);

  try {
    const response = await fetch(`https://www.instagram.com/api/v1/feed/user/${encodeURIComponent(username)}/username/?count=${count}`, {
      headers: {
        Accept: 'application/json',
        Referer: `https://www.instagram.com/${username}/`,
        'User-Agent': 'Mozilla/5.0',
        'X-IG-App-ID': INSTAGRAM_APP_ID,
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Instagram responded with ${response.status}: ${message.slice(0, 160)}`);
    }

    const payload = await response.json();
    const posts = Array.isArray(payload.items) ? payload.items : [];

    const serialized = posts
      .map((item) => {
        const imageUrl = getItemImage(item);
        const permalink = getPermalink(item);
        if (!imageUrl || !permalink) return null;

        const caption = getItemCaption(item);
        return {
          id: item.id,
          shortcode: item.code,
          permalink,
          image_url: imageUrl,
          alt: caption ? caption.slice(0, 180) : 'Barefoot Gifting Instagram post',
          caption,
          taken_at: item.taken_at || null,
        };
      })
      .filter(Boolean)
      .slice(0, count);

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');
    return res.status(200).json({
      username,
      profile_url: `https://www.instagram.com/${username}/`,
      count: serialized.length,
      posts: serialized,
    });
  } catch (error) {
    return res.status(502).json({
      error: 'Could not load Instagram posts',
      detail: error.message,
    });
  }
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  if (req.method === 'GET') {
    if (String(req.query.feed || '') === 'instagram') {
      return handleInstagramFeed(req, res);
    }

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
      out.mailerlite_api_key_set = !!process.env.MAILERLITE_API_KEY;
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
