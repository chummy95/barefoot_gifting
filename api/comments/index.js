const { sql } = require('../_lib/db');
const { requireAuth, verifyToken, getTokenFromReq } = require('../_lib/auth');
const { cors } = require('../_lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  if (req.method === 'GET') {
    const token = getTokenFromReq(req);
    const payload = token ? verifyToken(token) : null;
    const isAdmin = payload && payload.role === 'admin';

    const { productId, postId, status } = req.query;
    let query = 'SELECT * FROM comments WHERE TRUE';
    const params = [];
    if (productId) { params.push(productId); query += ` AND product_id = $${params.length}`; }
    if (postId) { params.push(postId); query += ` AND post_id = $${params.length}`; }
    if (isAdmin && status) { params.push(status); query += ` AND status = $${params.length}`; }
    if (!isAdmin) { query += ` AND status = 'approved'`; }
    query += ' ORDER BY created_at DESC';

    const { rows } = await sql.query(query, params);
    return res.status(200).json(rows);
  }

  if (req.method === 'POST') {
    // Anyone (including guests) can submit a comment/review; it starts as "pending"
    // until an admin approves it from the dashboard.
    const { productId, postId, name, email, rating, body } = req.body || {};
    if (!name || !body || (!productId && !postId)) {
      return res.status(400).json({ error: 'name, body and either productId or postId are required' });
    }
    const token = getTokenFromReq(req);
    const payload = token ? verifyToken(token) : null;

    const { rows } = await sql`
      INSERT INTO comments (product_id, post_id, user_id, name, email, rating, body, status)
      VALUES (${productId || null}, ${postId || null}, ${payload ? payload.id : null}, ${name}, ${email || null}, ${rating || null}, ${body}, 'pending')
      RETURNING *
    `;
    return res.status(201).json(rows[0]);
  }

  res.status(405).json({ error: 'Method not allowed' });
};
