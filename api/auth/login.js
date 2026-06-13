const bcrypt = require('bcryptjs');
const { sql } = require('../_lib/db');
const { signToken } = require('../_lib/auth');
const { cors } = require('../_lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const { rows } = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()}`;
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  const token = signToken(user);
  res.status(200).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
};
