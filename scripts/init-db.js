/**
 * One-time DB setup: creates tables (schema.sql) and an initial admin user.
 *
 * Usage:
 *   POSTGRES_URL="..." ADMIN_EMAIL="you@barefootgifting.com" ADMIN_PASSWORD="changeme123" node scripts/init-db.js
 *
 * Or just run `npm run db:init` after creating a .env file (values are read
 * from process.env — use `vercel env pull` to fetch them locally first).
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { sql } = require('@vercel/postgres');

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');

  // @vercel/postgres doesn't support multi-statement queries, so split on ';'
  const statements = schema
    .split(/;\s*(?:\n|$)/)
    .map(s => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    await sql.query(stmt);
  }
  console.log('✓ Schema applied');

  const email = process.env.ADMIN_EMAIL || 'admin@barefootgifting.com';
  const password = process.env.ADMIN_PASSWORD || 'Barefoot2026!';
  const hash = await bcrypt.hash(password, 10);

  await sql.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'`,
    ['Admin', email, hash]
  );

  console.log(`✓ Admin user ready: ${email} / ${password}`);
  console.log('  (log in at /admin and change this password immediately)');
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
