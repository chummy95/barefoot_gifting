const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { cors } = require('../_lib/cors');

// Accepts either a numeric product id or its slug.
async function findProduct(idOrSlug) {
  const isNumeric = /^\d+$/.test(idOrSlug);
  const { rows } = isNumeric
    ? await sql`SELECT * FROM products WHERE id = ${idOrSlug}`
    : await sql`SELECT * FROM products WHERE slug = ${idOrSlug}`;
  return rows[0];
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const { id } = req.query;

  if (req.method === 'GET') {
    const product = await findProduct(id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const { rows: images } = await sql`SELECT * FROM product_images WHERE product_id = ${product.id} ORDER BY position ASC`;
    return res.status(200).json({ ...product, images });
  }

  // Mutations require admin auth
  const user = requireAuth(req, res, ['admin']);
  if (!user) return;

  const product = await findProduct(id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { name, category, price, description, stock, customizable, badge, status, images } = req.body || {};
    const { rows } = await sql`
      UPDATE products SET
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
        await sql`INSERT INTO product_images (product_id, url, alt, position) VALUES (${product.id}, ${images[i].url}, ${images[i].alt || name || product.name}, ${i})`;
      }
    }

    const { rows: finalImages } = await sql`SELECT * FROM product_images WHERE product_id = ${product.id} ORDER BY position ASC`;
    return res.status(200).json({ ...rows[0], images: finalImages });
  }

  if (req.method === 'DELETE') {
    await sql`DELETE FROM products WHERE id = ${product.id}`;
    return res.status(204).end();
  }

  res.status(405).json({ error: 'Method not allowed' });
};
