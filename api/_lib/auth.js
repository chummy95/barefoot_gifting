const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    SECRET,
    { expiresIn: '7d' }
  );
}

function getTokenFromReq(req) {
  const header = req.headers['authorization'] || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  // fallback: cookie named "bfg_token"
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/bfg_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

/** Use inside an API handler: const user = requireAuth(req, res); if (!user) return; */
function requireAuth(req, res, roles) {
  const token = getTokenFromReq(req);
  const payload = token && verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  if (roles && !roles.includes(payload.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return payload;
}

module.exports = { signToken, verifyToken, getTokenFromReq, requireAuth };
