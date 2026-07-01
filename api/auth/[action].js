const bcrypt = require('bcryptjs');
const { sql } = require('../_lib/db');
const { cors } = require('../_lib/cors');
const { signToken, requireAuth } = require('../_lib/auth');
const { syncSubscriber } = require('../_lib/mailerlite');

function getAction(queryValue) {
  return Array.isArray(queryValue) ? queryValue[0] : queryValue;
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  const action = getAction(req.query.action);

  if (action === 'login') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const { rows } = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()}`;
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken(user);
    return res.status(200).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  }

  if (action === 'register') {
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

    try {
      await syncSubscriber({
        email: user.email,
        name,
        phone,
        source: 'customer',
        statusWhenNew: 'unconfirmed',
      });
    } catch (error) {
      console.error('MailerLite customer sync failed during registration:', error.message);
    }

    return res.status(201).json({ token, user });
  }

  if (action === 'me') {
    const payload = requireAuth(req, res);
    if (!payload) return;

    if (req.method === 'GET') {
      const { rows } = await sql`
        SELECT id, name, email, role, phone, address, created_at
        FROM users
        WHERE id = ${payload.id}
      `;
      if (!rows[0]) return res.status(404).json({ error: 'User not found' });
      return res.status(200).json(rows[0]);
    }

    if (req.method === 'PUT') {
      const { name, phone, address } = req.body || {};
      const { rows } = await sql`
        UPDATE users
        SET
          name = COALESCE(${name}, name),
          phone = COALESCE(${phone}, phone),
          address = COALESCE(${address}, address)
        WHERE id = ${payload.id}
        RETURNING id, name, email, role, phone, address
      `;
      return res.status(200).json(rows[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(404).json({ error: 'Not found' });
};
