const bcrypt = require('bcryptjs');
const { sql } = require('../_lib/db');
const { signToken } = require('../_lib/auth');
const { cors } = require('../_lib/cors');

// Customer self-registration (storefront "Create Account").
module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, password, phone } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`;
  if (existing.rows.length) return res.status(409).json({ error: 'An account with this email already exists' });

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await sql`
    INSERT INTO users (name, email, password_hash, role, phone)
    VALUES (${name}, ${email.toLowerCase()}, ${hash}, 'customer', ${phone || null})
    RETURNING id, name, email, role
  `;
  const user = rows[0];
  const token = signToken(user);
  res.status(201).json({ token, user });
};
