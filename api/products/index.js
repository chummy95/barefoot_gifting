const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { cors } = require('../_lib/cors');

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  if (req.method === 'GET') {
    const { category, status, search } = req.query;
    let rows;
    // Storefront only sees published products unless an admin token is present
    const auth = requireAuthOptional(req);
    const isAdmin = auth && auth.role === 'admin';

    const { rows: products } = await sql.query(
      `SELECT * FROM products
       WHERE (${category ? 'category = $1' : 'TRUE'})
         AND (${isAdmin ? 'TRUE' : "status = 'published'"})
         AND (${search ? `(name ILIKE $${category ? 2 : 1} OR description ILIKE $${category ? 2 : 1})` : 'TRUE'})
       ORDER BY created_at DESC`,
      [category, search ? `%${search}%` : null].filter((v, i) => (i === 0 ? !!category : !!search))
    );
    rows = products;

    // attach images
    const ids = rows.map(r => r.id);
    let images = [];
    if (ids.length) {
      const imgRes = await sql.query(
        `SELECT * FROM product_images WHERE product_id = ANY($1) ORDER BY position ASC`,
        [ids]
      );
      images = imgRes.rows;
    }
    const withImages = rows.map(p => ({
      ...p,
      images: images.filter(i => i.product_id === p.id)
    }));

    return res.status(200).json(withImages);
  }

  if (req.method === 'POST') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;

    const { name, category, price, description, stock, customizable, badge, status, images } = req.body || {};
    if (!name || !category || price == null) {
      return res.status(400).json({ error: 'name, category and price are required' });
    }

    let slug = slugify(name);
    // ensure unique slug
    const existing = await sql`SELECT id FROM products WHERE slug = ${slug}`;
    if (existing.rows.length) slug = `${slug}-${Date.now().toString().slice(-5)}`;

    const { rows } = await sql`
      INSERT INTO products (slug, name, category, price, description, stock, customizable, badge, status)
      VALUES (${slug}, ${name}, ${category}, ${price}, ${description || ''}, ${stock || 0}, ${!!customizable}, ${badge || null}, ${status || 'published'})
      RETURNING *
    `;
    const product = rows[0];

    if (Array.isArray(images)) {
      for (let i = 0; i < images.length; i++) {
        await sql`INSERT INTO product_images (product_id, url, alt, position) VALUES (${product.id}, ${images[i].url}, ${images[i].alt || name}, ${i})`;
      }
    }

    return res.status(201).json(product);
  }

  res.status(405).json({ error: 'Method not allowed' });
};

// Best-effort decode of an auth token without rejecting the request (used to
// decide whether to include draft products for admins browsing the storefront).
function requireAuthOptional(req) {
  const { verifyToken, getTokenFromReq } = require('../_lib/auth');
  const token = getTokenFromReq(req);
  return token ? verifyToken(token) : null;
}
