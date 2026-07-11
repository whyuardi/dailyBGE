const jwt = require('jsonwebtoken');
const { dbGet } = require('./database');

// JWT secret — in production, use an environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'bge-daily-report-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await dbGet(
      `SELECT u.*, d.name as division_name
       FROM users u
       LEFT JOIN divisions d ON u.division_id = d.id
       WHERE u.id = ? AND u.is_active = 1`,
      decoded.id
    );

    if (!user) {
      return res.status(401).json({ error: 'User not found or inactive.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token tidak valid atau sudah kedaluwarsa.' });
  }
}

function ownerOnly(req, res, next) {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Access denied. Owner only.' });
  }
  next();
}

module.exports = { authMiddleware, ownerOnly, generateToken, JWT_SECRET };
