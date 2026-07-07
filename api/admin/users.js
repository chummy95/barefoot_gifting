const bcrypt = require('bcryptjs');
const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { cors } = require('../_lib/cors');

function cleanText(value) {
  return String(value || '').trim();
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  const user = requireAuth(req, res, ['admin']);
  if (!user) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const name = cleanText(req.body?.name) || 'Admin';
  const email = cleanText(req.body?.email).toLowerCase();
  const password = String(req.body?.password || '');
  const role = cleanText(req.body?.role).toLowerCase() || 'admin';

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  if (role !== 'admin') {
    return res.status(400).json({ error: 'Only admin accounts can be created here.' });
  }

  const hash = await bcrypt.hash(password, 10);

  const { rows } = await sql`
    INSERT INTO users (name, email, password_hash, role)
    VALUES (${name}, ${email}, ${hash}, 'admin')
    ON CONFLICT (email) DO UPDATE
    SET
      name = EXCLUDED.name,
      password_hash = EXCLUDED.password_hash,
      role = 'admin'
    RETURNING id, name, email, role, created_at
  `;

  return res.status(200).json({
    message: 'Admin account is ready.',
    user: rows[0],
  });
};
