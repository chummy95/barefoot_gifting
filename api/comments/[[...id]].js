const { sql } = require('../_lib/db');
const { requireAuth, verifyToken, getTokenFromReq } = require('../_lib/auth');
const { cors } = require('../_lib/cors');
const { getSegments } = require('../_lib/path-segments');

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  const segments = getSegments(req, '/api/comments');

  if (segments.length === 0) {
    if (req.method === 'GET') {
      const token = getTokenFromReq(req);
      const payload = token ? verifyToken(token) : null;
      const isAdmin = payload && payload.role === 'admin';

      const { productId, postId, status } = req.query;
      let query = 'SELECT * FROM comments WHERE TRUE';
      const params = [];
      if (productId) {
        params.push(productId);
        query += ` AND product_id = $${params.length}`;
      }
      if (postId) {
        params.push(postId);
        query += ` AND post_id = $${params.length}`;
      }
      if (isAdmin && status) {
        params.push(status);
        query += ` AND status = $${params.length}`;
      }
      if (!isAdmin) query += ` AND status = 'approved'`;
      query += ' ORDER BY created_at DESC';

      const { rows } = await sql.query(query, params);
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
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

    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (segments.length === 1) {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;

    const id = segments[0];

    if (req.method === 'PATCH') {
      const { status } = req.body || {};
      const allowed = ['pending', 'approved', 'spam', 'trash'];
      if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
      const { rows } = await sql`UPDATE comments SET status = ${status} WHERE id = ${id} RETURNING *`;
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json(rows[0]);
    }

    if (req.method === 'DELETE') {
      await sql`DELETE FROM comments WHERE id = ${id}`;
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(404).json({ error: 'Not found' });
};
