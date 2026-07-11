const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { initDb, dbGet, dbAll, dbRun, dbTransaction, hashPin, comparePin, getToday } = require('../database');
const { authMiddleware, ownerOnly, generateToken } = require('../auth');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Async handler wrapper (catches errors for Express 4) ---
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// --- Request body size limit ---
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '../public')));

// --- Ensure database is initialized before handling requests ---
app.use(async (req, res, next) => {
  try {
    await initDb();
    next();
  } catch (err) {
    console.error('❌ Database init error:', err);
    res.status(500).json({ error: 'Database initialization failed.' });
  }
});

// --- Rate limiting on login ---
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================
// AUTH ROUTES
// ============================================================

app.post('/api/auth/login', loginLimiter, wrap(async (req, res) => {
  const { phone, pin } = req.body;

  if (!phone || !pin) {
    return res.status(400).json({ error: 'Nomor HP dan PIN wajib diisi.' });
  }

  const phoneTrimmed = String(phone).trim();
  if (!/^\d{4,20}$/.test(phoneTrimmed)) {
    return res.status(400).json({ error: 'Format nomor HP tidak valid.' });
  }

  const pinTrimmed = String(pin).trim();
  if (pinTrimmed.length !== 4 || !/^\d{4}$/.test(pinTrimmed)) {
    return res.status(400).json({ error: 'PIN harus 4 digit angka.' });
  }

  const user = await dbGet(
    `SELECT u.id, u.name, u.phone, u.role, u.pin, u.division_id, d.name as division_name
     FROM users u
     LEFT JOIN divisions d ON u.division_id = d.id
     WHERE u.phone = ? AND u.is_active = 1`,
    phoneTrimmed
  );

  if (!user || !comparePin(pinTrimmed, user.pin)) {
    return res.status(401).json({ error: 'Nomor HP atau PIN salah.' });
  }

  const token = generateToken(user);
  const { pin: _, ...safeUser } = user;

  res.json({ success: true, user: safeUser, token });
}));

// ============================================================
// DIVISION ROUTES
// ============================================================

app.get('/api/divisions', authMiddleware, wrap(async (req, res) => {
  const divisions = await dbAll('SELECT * FROM divisions ORDER BY name');
  res.json(divisions);
}));

app.post('/api/divisions', authMiddleware, ownerOnly, wrap(async (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Nama divisi wajib diisi.' });
  }

  const nameTrimmed = String(name).trim();
  if (nameTrimmed.length > 100) {
    return res.status(400).json({ error: 'Nama divisi maksimal 100 karakter.' });
  }

  try {
    const result = await dbRun('INSERT INTO divisions (name) VALUES (?)', nameTrimmed);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Divisi sudah ada.' });
    }
    throw e;
  }
}));

app.put('/api/divisions/:id', authMiddleware, ownerOnly, wrap(async (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Nama divisi wajib diisi.' });
  }

  const nameTrimmed = String(name).trim();
  if (nameTrimmed.length > 100) {
    return res.status(400).json({ error: 'Nama divisi maksimal 100 karakter.' });
  }

  try {
    await dbRun('UPDATE divisions SET name = ? WHERE id = ?', nameTrimmed, req.params.id);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Nama divisi sudah digunakan.' });
    }
    throw e;
  }
}));

app.delete('/api/divisions/:id', authMiddleware, ownerOnly, wrap(async (req, res) => {
  const usersInDiv = await dbGet('SELECT COUNT(*) as count FROM users WHERE division_id = ?', req.params.id);
  if (usersInDiv.count > 0) {
    return res.status(400).json({ error: 'Tidak bisa hapus divisi yang masih memiliki karyawan.' });
  }
  await dbRun('DELETE FROM divisions WHERE id = ?', req.params.id);
  res.json({ success: true });
}));

// ============================================================
// USER MANAGEMENT ROUTES (Owner Only)
// ============================================================

app.get('/api/users', authMiddleware, ownerOnly, wrap(async (req, res) => {
  const users = await dbAll(
    `SELECT u.id, u.name, u.phone, u.role, u.is_active, u.division_id, u.created_at,
            d.name as division_name
     FROM users u
     LEFT JOIN divisions d ON u.division_id = d.id
     ORDER BY u.role DESC, u.name ASC`
  );
  res.json(users);
}));

app.post('/api/users', authMiddleware, ownerOnly, wrap(async (req, res) => {
  const { name, phone, pin, division_id, role } = req.body;

  if (!name || !phone || !pin || !division_id) {
    return res.status(400).json({ error: 'Semua field wajib diisi.' });
  }

  const nameTrimmed = String(name).trim();
  const phoneTrimmed = String(phone).trim();
  const pinTrimmed = String(pin).trim();

  if (nameTrimmed.length > 100) {
    return res.status(400).json({ error: 'Nama maksimal 100 karakter.' });
  }
  if (!/^\d{4,20}$/.test(phoneTrimmed)) {
    return res.status(400).json({ error: 'Nomor HP harus berupa 4-20 digit angka.' });
  }
  if (pinTrimmed.length !== 4 || !/^\d{4}$/.test(pinTrimmed)) {
    return res.status(400).json({ error: 'PIN harus 4 digit angka.' });
  }

  const userRole = role || 'karyawan';
  if (!['owner', 'karyawan'].includes(userRole)) {
    return res.status(400).json({ error: 'Role tidak valid.' });
  }

  try {
    const result = await dbRun(
      'INSERT INTO users (name, phone, pin, division_id, role) VALUES (?, ?, ?, ?, ?)',
      nameTrimmed, phoneTrimmed, hashPin(pinTrimmed), division_id, userRole
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Nomor HP sudah terdaftar.' });
    }
    throw e;
  }
}));

app.put('/api/users/:id', authMiddleware, ownerOnly, wrap(async (req, res) => {
  const { name, phone, pin, division_id, role, is_active } = req.body;
  const userId = req.params.id;

  const existing = await dbGet('SELECT * FROM users WHERE id = ?', userId);
  if (!existing) {
    return res.status(404).json({ error: 'User tidak ditemukan.' });
  }

  const updates = [];
  const values = [];

  if (name) {
    const nameTrimmed = String(name).trim();
    if (nameTrimmed.length > 100) {
      return res.status(400).json({ error: 'Nama maksimal 100 karakter.' });
    }
    updates.push('name = ?');
    values.push(nameTrimmed);
  }
  if (phone) {
    const phoneTrimmed = String(phone).trim();
    if (!/^\d{4,20}$/.test(phoneTrimmed)) {
      return res.status(400).json({ error: 'Nomor HP harus berupa 4-20 digit angka.' });
    }
    updates.push('phone = ?');
    values.push(phoneTrimmed);
  }
  if (pin) {
    const pinTrimmed = String(pin).trim();
    if (pinTrimmed.length !== 4 || !/^\d{4}$/.test(pinTrimmed)) {
      return res.status(400).json({ error: 'PIN harus 4 digit angka.' });
    }
    updates.push('pin = ?');
    values.push(hashPin(pinTrimmed));
  }
  if (division_id) { updates.push('division_id = ?'); values.push(division_id); }
  if (role) {
    if (!['owner', 'karyawan'].includes(role)) {
      return res.status(400).json({ error: 'Role tidak valid.' });
    }
    updates.push('role = ?');
    values.push(role);
  }
  if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Tidak ada data yang diupdate.' });
  }

  values.push(userId);

  try {
    await dbRun(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, ...values);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Nomor HP sudah digunakan user lain.' });
    }
    throw e;
  }
}));

app.delete('/api/users/:id', authMiddleware, ownerOnly, wrap(async (req, res) => {
  const userId = parseInt(req.params.id);

  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri.' });
  }

  await dbRun('UPDATE users SET is_active = 0 WHERE id = ?', userId);
  res.json({ success: true });
}));

// ============================================================
// REPORT ROUTES
// ============================================================

app.get('/api/reports/today', authMiddleware, wrap(async (req, res) => {
  const today = getToday();
  const report = await dbGet('SELECT * FROM reports WHERE user_id = ? AND report_date = ?', req.user.id, today);

  if (!report) {
    return res.json({ report: null, items: [] });
  }

  const items = await dbAll('SELECT * FROM report_items WHERE report_id = ? ORDER BY category, sort_order', report.id);
  res.json({ report, items });
}));

app.get('/api/reports/mine', authMiddleware, wrap(async (req, res) => {
  const { from, to } = req.query;
  let query = `
    SELECT r.*,
      (SELECT COUNT(*) FROM report_items ri WHERE ri.report_id = r.id AND ri.category = 'completed') as completed_count,
      (SELECT COUNT(*) FROM report_items ri WHERE ri.report_id = r.id AND ri.category = 'in_progress') as in_progress_count,
      (SELECT COUNT(*) FROM report_items ri WHERE ri.report_id = r.id AND ri.category = 'next_action') as next_action_count
    FROM reports r
    WHERE r.user_id = ?
  `;
  const params = [req.user.id];

  if (from) { query += ' AND r.report_date >= ?'; params.push(from); }
  if (to) { query += ' AND r.report_date <= ?'; params.push(to); }

  query += ' ORDER BY r.report_date DESC LIMIT 50';

  const reports = await dbAll(query, ...params);
  res.json(reports);
}));

app.get('/api/reports/:id', authMiddleware, wrap(async (req, res) => {
  const report = await dbGet(
    `SELECT r.*, u.name as user_name, d.name as division_name
     FROM reports r
     JOIN users u ON r.user_id = u.id
     LEFT JOIN divisions d ON u.division_id = d.id
     WHERE r.id = ?`,
    req.params.id
  );

  if (!report) {
    return res.status(404).json({ error: 'Report tidak ditemukan.' });
  }

  if (req.user.role === 'karyawan' && report.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Akses ditolak.' });
  }

  const items = await dbAll('SELECT * FROM report_items WHERE report_id = ? ORDER BY category, sort_order', report.id);
  res.json({ report, items });
}));

app.post('/api/reports', authMiddleware, wrap(async (req, res) => {
  const { items } = req.body;
  const today = getToday();

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Report items wajib diisi.' });
  }

  if (items.length > 50) {
    return res.status(400).json({ error: 'Maksimal 50 item per report.' });
  }

  for (const item of items) {
    if (!item.category || !item.content || !String(item.content).trim()) {
      return res.status(400).json({ error: 'Setiap item harus memiliki kategori dan isi.' });
    }
    if (!['completed', 'in_progress', 'next_action'].includes(item.category)) {
      return res.status(400).json({ error: 'Kategori tidak valid.' });
    }
    if (String(item.content).trim().length > 1000) {
      return res.status(400).json({ error: 'Isi item maksimal 1000 karakter.' });
    }
  }

  const existingReport = await dbGet('SELECT * FROM reports WHERE user_id = ? AND report_date = ?', req.user.id, today);

  const reportId = await dbTransaction(async (tx) => {
    let id;

    if (existingReport) {
      await tx.run('UPDATE reports SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', existingReport.id);
      await tx.run('DELETE FROM report_items WHERE report_id = ?', existingReport.id);
      id = existingReport.id;
    } else {
      const result = await tx.run('INSERT INTO reports (user_id, report_date) VALUES (?, ?)', req.user.id, today);
      id = result.lastInsertRowid;
    }

    for (let i = 0; i < items.length; i++) {
      await tx.run(
        'INSERT INTO report_items (report_id, category, content, sort_order) VALUES (?, ?, ?, ?)',
        id, items[i].category, String(items[i].content).trim(), i
      );
    }

    return id;
  });

  res.json({ success: true, id: reportId, isUpdate: !!existingReport });
}));

// ============================================================
// DASHBOARD ROUTES (Owner Only)
// ============================================================

app.get('/api/dashboard', authMiddleware, ownerOnly, wrap(async (req, res) => {
  const date = req.query.date || getToday();
  const divisionId = req.query.division_id;

  let query = `
    SELECT r.*, u.name as user_name, u.phone as user_phone, d.name as division_name, d.id as div_id
    FROM reports r
    JOIN users u ON r.user_id = u.id
    LEFT JOIN divisions d ON u.division_id = d.id
    WHERE r.report_date = ?
  `;
  const params = [date];

  if (divisionId) {
    query += ' AND u.division_id = ?';
    params.push(divisionId);
  }

  query += ' ORDER BY d.name, u.name';

  const reports = await dbAll(query, ...params);

  const result = [];
  for (const r of reports) {
    const items = await dbAll('SELECT * FROM report_items WHERE report_id = ? ORDER BY category, sort_order', r.id);
    result.push({ ...r, items });
  }

  res.json(result);
}));

app.get('/api/dashboard/missing', authMiddleware, ownerOnly, wrap(async (req, res) => {
  const date = req.query.date || getToday();

  const missing = await dbAll(
    `SELECT u.id, u.name, u.phone, d.name as division_name
     FROM users u
     LEFT JOIN divisions d ON u.division_id = d.id
     WHERE u.is_active = 1
       AND u.id NOT IN (
         SELECT user_id FROM reports WHERE report_date = ?
       )
     ORDER BY d.name, u.name`,
    date
  );

  res.json(missing);
}));

app.get('/api/dashboard/stats', authMiddleware, ownerOnly, wrap(async (req, res) => {
  const date = req.query.date || getToday();

  const totalUsersRow = await dbGet('SELECT COUNT(*) as count FROM users WHERE is_active = 1');
  const submittedRow = await dbGet('SELECT COUNT(*) as count FROM reports WHERE report_date = ?', date);
  const totalDivsRow = await dbGet('SELECT COUNT(*) as count FROM divisions');

  const totalUsers = totalUsersRow.count;
  const submittedToday = submittedRow.count;

  res.json({
    total_users: totalUsers,
    submitted_today: submittedToday,
    missing_today: totalUsers - submittedToday,
    total_divisions: totalDivsRow.count,
    date
  });
}));

// ============================================================
// SPA FALLBACK
// ============================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
  }
  res.redirect('/');
});

app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.message);
  res.status(500).json({ error: 'Terjadi kesalahan internal server.' });
});

// ============================================================
// START SERVER
// ============================================================
if (!process.env.VERCEL) {
  initDb().then(() => {
    app.listen(PORT, () => {
      console.log(`\n🟢 Benua Green Energy — Daily Report`);
      console.log(`   Server running at http://localhost:${PORT}`);
      console.log(`   Default login → Phone: 0000, PIN: 1234\n`);
    });
  }).catch(err => {
    console.error('❌ Failed to start:', err);
    process.exit(1);
  });
}

module.exports = app;
