const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { cors } = require('../_lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const user = requireAuth(req, res, ['admin']);
  if (!user) return;

  const [{ rows: ordersAgg }, { rows: products }, { rows: pending }, { rows: customers }, { rows: recent }] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count, COALESCE(SUM(total),0)::int AS revenue FROM orders WHERE payment_status = 'paid'`,
    sql`SELECT COUNT(*)::int AS count FROM products`,
    sql`SELECT COUNT(*)::int AS count FROM comments WHERE status = 'pending'`,
    sql`SELECT COUNT(*)::int AS count FROM users WHERE role = 'customer'`,
    sql`SELECT id, name, email, total, status, created_at FROM orders ORDER BY created_at DESC LIMIT 5`,
  ]);

  res.status(200).json({
    orders: ordersAgg[0].count,
    revenue: ordersAgg[0].revenue,
    products: products[0].count,
    pendingComments: pending[0].count,
    customers: customers[0].count,
    recentOrders: recent,
  });
};
