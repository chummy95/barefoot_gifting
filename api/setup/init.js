const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { sql } = require('../_lib/db');
const { cors } = require('../_lib/cors');

function getBootstrapToken(req) {
  return (
    req.headers['x-init-token'] ||
    req.body?.token ||
    req.query?.token ||
    ''
  );
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expectedToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
  if (!expectedToken || getBootstrapToken(req) !== expectedToken) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const schema = fs.readFileSync(
    path.join(__dirname, '..', '..', 'schema.sql'),
    'utf8'
  );

  const statements = schema
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await sql.query(statement);
  }

  const email = process.env.ADMIN_EMAIL || 'admin@barefootgifting.com';
  const password = process.env.ADMIN_PASSWORD || 'Barefoot2026!';
  const passwordHash = await bcrypt.hash(password, 10);

  await sql.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO UPDATE
     SET password_hash = EXCLUDED.password_hash, role = 'admin'`,
    ['Admin', email, passwordHash]
  );

  return res.status(200).json({
    ok: true,
    admin: { email },
    message: 'Schema applied and admin user is ready.',
  });
};
