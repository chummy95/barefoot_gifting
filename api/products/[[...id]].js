const { sql } = require('../_lib/db');
const { requireAuth, verifyToken, getTokenFromReq } = require('../_lib/auth');
const { cors } = require('../_lib/cors');

function getSegments(queryValue) {
  if (!queryValue) return [];
  return Array.isArray(queryValue) ? queryValue : [queryValue];
}

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function requireAuthOptional(req) {
  const token = getTokenFromReq(req);
  return token ? verifyToken(token) : null;
}

async function findProduct(idOrSlug) {
  const isNumeric = /^\d+$/.test(idOrSlug);
  const { rows } = isNumeric
    ? await sql`SELECT * FROM products WHERE id = ${idOrSlug}`
    : await sql`SELECT * FROM products WHERE slug = ${idOrSlug}`;
  return rows[0];
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  const segments = getSegments(req.query.id);

  if (segments.length === 0) {
    if (req.method === 'GET') {
      const { category, search } = req.query;
      const auth = requireAuthOptional(req);
      const isAdmin = auth && auth.role === 'admin';

      const { rows } = await sql.query(
        `SELECT * FROM products
         WHERE (${category ? 'category = $1' : 'TRUE'})
           AND (${isAdmin ? 'TRUE' : "status = 'published'"})
           AND (${search ? `(name ILIKE $${category ? 2 : 1} OR description ILIKE $${category ? 2 : 1})` : 'TRUE'})
         ORDER BY created_at DESC`,
        [category, search ? `%${search}%` : null].filter((v, i) => (i === 0 ? !!category : !!search))
      );

      const ids = rows.map(r => r.id);
      let images = [];
      if (ids.length) {
        const imgRes = await sql.query(
          `SELECT * FROM product_images WHERE product_id = ANY($1) ORDER BY position ASC`,
          [ids]
        );
        images = imgRes.rows;
      }
      return res.status(200).json(rows.map(p => ({
        ...p,
        images: images.filter(i => i.product_id === p.id),
      })));
    }

    if (req.method === 'POST') {
      const user = requireAuth(req, res, ['admin']);
      if (!user) return;

      const { name, category, price, description, stock, customizable, badge, status, images } = req.body || {};
      if (!name || !category || price == null) {
        return res.status(400).json({ error: 'name, category and price are required' });
      }

      let slug = slugify(name);
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
          await sql`
            INSERT INTO product_images (product_id, url, alt, position)
            VALUES (${product.id}, ${images[i].url}, ${images[i].alt || name}, ${i})
          `;
        }
      }

      return res.status(201).json(product);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (segments.length === 1) {
    const id = segments[0];

    if (req.method === 'GET') {
      const product = await findProduct(id);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      const { rows: images } = await sql`SELECT * FROM product_images WHERE product_id = ${product.id} ORDER BY position ASC`;
      return res.status(200).json({ ...product, images });
    }

    const user = requireAuth(req, res, ['admin']);
    if (!user) return;

    const product = await findProduct(id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const { name, category, price, description, stock, customizable, badge, status, images } = req.body || {};
      const { rows } = await sql`
        UPDATE products
        SET
          name = COALESCE(${name}, name),
          category = COALESCE(${category}, category),
          price = COALESCE(${price}, price),
          description = COALESCE(${description}, description),
          stock = COALESCE(${stock}, stock),
          customizable = COALESCE(${customizable}, customizable),
          badge = ${badge !== undefined ? badge : sql`badge`},
          status = COALESCE(${status}, status),
          updated_at = now()
        WHERE id = ${product.id}
        RETURNING *
      `;

      if (Array.isArray(images)) {
        await sql`DELETE FROM product_images WHERE product_id = ${product.id}`;
        for (let i = 0; i < images.length; i++) {
          await sql`
            INSERT INTO product_images (product_id, url, alt, position)
            VALUES (${product.id}, ${images[i].url}, ${images[i].alt || name || product.name}, ${i})
          `;
        }
      }

      const { rows: finalImages } = await sql`SELECT * FROM product_images WHERE product_id = ${product.id} ORDER BY position ASC`;
      return res.status(200).json({ ...rows[0], images: finalImages });
    }

    if (req.method === 'DELETE') {
      await sql`DELETE FROM products WHERE id = ${product.id}`;
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(404).json({ error: 'Not found' });
};
