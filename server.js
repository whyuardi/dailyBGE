const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { db, hashPin, comparePin, getToday } = require('./database');
const { authMiddleware, ownerOnly, generateToken } = require('./middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// --- H-05: Request body size limit ---
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- C-03: Rate limiting on login ---
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================
// AUTH ROUTES
// ============================================================

// POST /api/auth/login
app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { phone, pin } = req.body;

  if (!phone || !pin) {
    return res.status(400).json({ error: 'Nomor HP dan PIN wajib diisi.' });
  }

  // --- M-06: Validate phone format ---
  const phoneTrimmed = String(phone).trim();
  if (!/^\d{4,20}$/.test(phoneTrimmed)) {
    return res.status(400).json({ error: 'Format nomor HP tidak valid.' });
  }

  const pinTrimmed = String(pin).trim();
  if (pinTrimmed.length !== 4 || !/^\d{4}$/.test(pinTrimmed)) {
    return res.status(400).json({ error: 'PIN harus 4 digit angka.' });
  }

  const user = db.prepare(`
    SELECT u.id, u.name, u.phone, u.role, u.pin, u.division_id, d.name as division_name
    FROM users u
    LEFT JOIN divisions d ON u.division_id = d.id
    WHERE u.phone = ? AND u.is_active = 1
  `).get(phoneTrimmed);

  if (!user || !comparePin(pinTrimmed, user.pin)) {
    return res.status(401).json({ error: 'Nomor HP atau PIN salah.' });
  }

  // Generate JWT token
  const token = generateToken(user);

  // Don't send pin hash to client
  const { pin: _, ...safeUser } = user;

  res.json({ success: true, user: safeUser, token });
});

// ============================================================
// DIVISION ROUTES
// ============================================================

// GET /api/divisions — list all divisions
app.get('/api/divisions', authMiddleware, (req, res) => {
  const divisions = db.prepare('SELECT * FROM divisions ORDER BY name').all();
  res.json(divisions);
});

// POST /api/divisions — create division (owner only)
app.post('/api/divisions', authMiddleware, ownerOnly, (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Nama divisi wajib diisi.' });
  }

  // --- H-04: Input length validation ---
  const nameTrimmed = String(name).trim();
  if (nameTrimmed.length > 100) {
    return res.status(400).json({ error: 'Nama divisi maksimal 100 karakter.' });
  }

  try {
    const result = db.prepare('INSERT INTO divisions (name) VALUES (?)').run(nameTrimmed);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Divisi sudah ada.' });
    }
    throw e;
  }
});

// PUT /api/divisions/:id — update division (owner only)
app.put('/api/divisions/:id', authMiddleware, ownerOnly, (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Nama divisi wajib diisi.' });
  }

  // --- H-04: Input length validation ---
  const nameTrimmed = String(name).trim();
  if (nameTrimmed.length > 100) {
    return res.status(400).json({ error: 'Nama divisi maksimal 100 karakter.' });
  }

  try {
    db.prepare('UPDATE divisions SET name = ? WHERE id = ?').run(nameTrimmed, req.params.id);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Nama divisi sudah digunakan.' });
    }
    throw e;
  }
});

// DELETE /api/divisions/:id — delete division (owner only)
app.delete('/api/divisions/:id', authMiddleware, ownerOnly, (req, res) => {
  const usersInDiv = db.prepare('SELECT COUNT(*) as count FROM users WHERE division_id = ?').get(req.params.id);
  if (usersInDiv.count > 0) {
    return res.status(400).json({ error: 'Tidak bisa hapus divisi yang masih memiliki karyawan.' });
  }
  db.prepare('DELETE FROM divisions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============================================================
// USER MANAGEMENT ROUTES (Owner Only)
// ============================================================

// GET /api/users — list all users
app.get('/api/users', authMiddleware, ownerOnly, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.name, u.phone, u.role, u.is_active, u.division_id, u.created_at,
           d.name as division_name
    FROM users u
    LEFT JOIN divisions d ON u.division_id = d.id
    ORDER BY u.role DESC, u.name ASC
  `).all();
  res.json(users);
});

// POST /api/users — create user (owner only)
app.post('/api/users', authMiddleware, ownerOnly, (req, res) => {
  const { name, phone, pin, division_id, role } = req.body;

  if (!name || !phone || !pin || !division_id) {
    return res.status(400).json({ error: 'Semua field wajib diisi.' });
  }

  // --- H-04: Input length validation ---
  const nameTrimmed = String(name).trim();
  const phoneTrimmed = String(phone).trim();
  const pinTrimmed = String(pin).trim();

  if (nameTrimmed.length > 100) {
    return res.status(400).json({ error: 'Nama maksimal 100 karakter.' });
  }

  // --- M-06: Phone format validation ---
  if (!/^\d{4,20}$/.test(phoneTrimmed)) {
    return res.status(400).json({ error: 'Nomor HP harus berupa 4-20 digit angka.' });
  }

  if (pinTrimmed.length !== 4 || !/^\d{4}$/.test(pinTrimmed)) {
    return res.status(400).json({ error: 'PIN harus 4 digit angka.' });
  }

  // --- C-04: Validate role ---
  const userRole = role || 'karyawan';
  if (!['owner', 'karyawan'].includes(userRole)) {
    return res.status(400).json({ error: 'Role tidak valid.' });
  }

  try {
    const result = db.prepare(
      'INSERT INTO users (name, phone, pin, division_id, role) VALUES (?, ?, ?, ?, ?)'
    ).run(nameTrimmed, phoneTrimmed, hashPin(pinTrimmed), division_id, userRole);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Nomor HP sudah terdaftar.' });
    }
    throw e;
  }
});

// PUT /api/users/:id — update user (owner only)
app.put('/api/users/:id', authMiddleware, ownerOnly, (req, res) => {
  const { name, phone, pin, division_id, role, is_active } = req.body;
  const userId = req.params.id;

  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
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
    // --- C-04: Validate role ---
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
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Nomor HP sudah digunakan user lain.' });
    }
    throw e;
  }
});

// DELETE /api/users/:id — deactivate user (owner only)
app.delete('/api/users/:id', authMiddleware, ownerOnly, (req, res) => {
  const userId = parseInt(req.params.id);

  // Prevent owner from deleting themselves
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri.' });
  }

  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(userId);
  res.json({ success: true });
});

// ============================================================
// REPORT ROUTES
// ============================================================

// GET /api/reports/today — get current user's report for today
app.get('/api/reports/today', authMiddleware, (req, res) => {
  // --- M-01: Use Asia/Jakarta timezone ---
  const today = getToday();
  const report = db.prepare('SELECT * FROM reports WHERE user_id = ? AND report_date = ?').get(req.user.id, today);

  if (!report) {
    return res.json({ report: null, items: [] });
  }

  const items = db.prepare('SELECT * FROM report_items WHERE report_id = ? ORDER BY category, sort_order').all(report.id);
  res.json({ report, items });
});

// GET /api/reports/mine — get current user's report history
app.get('/api/reports/mine', authMiddleware, (req, res) => {
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

  const reports = db.prepare(query).all(...params);
  res.json(reports);
});

// GET /api/reports/:id — get single report with items
app.get('/api/reports/:id', authMiddleware, (req, res) => {
  const report = db.prepare(`
    SELECT r.*, u.name as user_name, d.name as division_name 
    FROM reports r
    JOIN users u ON r.user_id = u.id
    LEFT JOIN divisions d ON u.division_id = d.id
    WHERE r.id = ?
  `).get(req.params.id);

  if (!report) {
    return res.status(404).json({ error: 'Report tidak ditemukan.' });
  }

  // Karyawan hanya bisa lihat report sendiri
  if (req.user.role === 'karyawan' && report.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Akses ditolak.' });
  }

  const items = db.prepare('SELECT * FROM report_items WHERE report_id = ? ORDER BY category, sort_order').all(report.id);
  res.json({ report, items });
});

// POST /api/reports — create or update today's report
app.post('/api/reports', authMiddleware, (req, res) => {
  const { items } = req.body;
  // --- M-01: Use Asia/Jakarta timezone ---
  const today = getToday();

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Report items wajib diisi.' });
  }

  // --- H-07: Cap report items at 50 ---
  if (items.length > 50) {
    return res.status(400).json({ error: 'Maksimal 50 item per report.' });
  }

  // Validate items
  for (const item of items) {
    if (!item.category || !item.content || !String(item.content).trim()) {
      return res.status(400).json({ error: 'Setiap item harus memiliki kategori dan isi.' });
    }
    if (!['completed', 'in_progress', 'next_action'].includes(item.category)) {
      return res.status(400).json({ error: 'Kategori tidak valid.' });
    }
    // --- H-04: Content length validation ---
    if (String(item.content).trim().length > 1000) {
      return res.status(400).json({ error: 'Isi item maksimal 1000 karakter.' });
    }
  }

  const existingReport = db.prepare('SELECT * FROM reports WHERE user_id = ? AND report_date = ?').get(req.user.id, today);

  const transaction = db.transaction(() => {
    let reportId;

    if (existingReport) {
      // Update existing report
      db.prepare('UPDATE reports SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(existingReport.id);
      db.prepare('DELETE FROM report_items WHERE report_id = ?').run(existingReport.id);
      reportId = existingReport.id;
    } else {
      // Create new report
      const result = db.prepare('INSERT INTO reports (user_id, report_date) VALUES (?, ?)').run(req.user.id, today);
      reportId = result.lastInsertRowid;
    }

    // Insert items
    const insertItem = db.prepare('INSERT INTO report_items (report_id, category, content, sort_order) VALUES (?, ?, ?, ?)');
    for (let i = 0; i < items.length; i++) {
      insertItem.run(reportId, items[i].category, String(items[i].content).trim(), i);
    }

    return reportId;
  });

  const reportId = transaction();
  res.json({ success: true, id: reportId, isUpdate: !!existingReport });
});

// ============================================================
// DASHBOARD ROUTES (Owner Only)
// ============================================================

// GET /api/dashboard — get all reports for a date
app.get('/api/dashboard', authMiddleware, ownerOnly, (req, res) => {
  // --- M-01: Use Asia/Jakarta timezone ---
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

  const reports = db.prepare(query).all(...params);

  // Get items for each report
  const getItems = db.prepare('SELECT * FROM report_items WHERE report_id = ? ORDER BY category, sort_order');
  const result = reports.map(r => ({
    ...r,
    items: getItems.all(r.id)
  }));

  res.json(result);
});

// GET /api/dashboard/missing — get users who haven't submitted today
app.get('/api/dashboard/missing', authMiddleware, ownerOnly, (req, res) => {
  // --- M-01: Use Asia/Jakarta timezone ---
  const date = req.query.date || getToday();

  const missing = db.prepare(`
    SELECT u.id, u.name, u.phone, d.name as division_name
    FROM users u
    LEFT JOIN divisions d ON u.division_id = d.id
    WHERE u.is_active = 1
      AND u.id NOT IN (
        SELECT user_id FROM reports WHERE report_date = ?
      )
    ORDER BY d.name, u.name
  `).all(date);

  res.json(missing);
});

// GET /api/dashboard/stats — summary statistics
app.get('/api/dashboard/stats', authMiddleware, ownerOnly, (req, res) => {
  // --- M-01: Use Asia/Jakarta timezone ---
  const date = req.query.date || getToday();

  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get().count;
  const submittedToday = db.prepare('SELECT COUNT(*) as count FROM reports WHERE report_date = ?').get(date).count;
  const totalDivisions = db.prepare('SELECT COUNT(*) as count FROM divisions').get().count;

  res.json({
    total_users: totalUsers,
    submitted_today: submittedToday,
    missing_today: totalUsers - submittedToday,
    total_divisions: totalDivisions,
    date
  });
});

// ============================================================
// SPA FALLBACK
// ============================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- M-02: Catch-all 404 handler for invalid routes ---
app.use((req, res) => {
  // For API routes, return JSON
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
  }
  // For other routes, redirect to login
  res.redirect('/');
});

// --- H-06: Global error handling middleware ---
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.message);
  res.status(500).json({ error: 'Terjadi kesalahan internal server.' });
});

// ============================================================
// START SERVER
// ============================================================
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n🟢 Benua Green Energy — Daily Report`);
    console.log(`   Server running at http://localhost:${PORT}`);
    console.log(`   Default login → Phone: 0000, PIN: 1234\n`);
  });
}

module.exports = app;
