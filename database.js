const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// --- Config ---
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

let client = null;
let _initialized = false;
let _initPromise = null;

// --- Create client ---
function _createClient() {
  if (TURSO_URL) {
    return createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  }
  // Local SQLite file
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'daily_report.db').replace(/\\/g, '/');
  return createClient({ url: `file:${dbPath}` });
}

// ============================================================
// Async DB helpers
// ============================================================

async function dbGet(sql, ...args) {
  const result = await client.execute({ sql, args });
  return result.rows[0] ? { ...result.rows[0] } : undefined;
}

async function dbAll(sql, ...args) {
  const result = await client.execute({ sql, args });
  return result.rows.map(r => ({ ...r }));
}

async function dbRun(sql, ...args) {
  const result = await client.execute({ sql, args });
  return {
    lastInsertRowid: Number(result.lastInsertRowid),
    changes: result.rowsAffected,
  };
}

async function dbTransaction(fn) {
  const tx = await client.transaction('write');
  const txHelpers = {
    async get(sql, ...args) {
      const r = await tx.execute({ sql, args });
      return r.rows[0] ? { ...r.rows[0] } : undefined;
    },
    async all(sql, ...args) {
      const r = await tx.execute({ sql, args });
      return r.rows.map(row => ({ ...row }));
    },
    async run(sql, ...args) {
      const r = await tx.execute({ sql, args });
      return { lastInsertRowid: Number(r.lastInsertRowid), changes: r.rowsAffected };
    },
  };
  try {
    const result = await fn(txHelpers);
    await tx.commit();
    return result;
  } catch (e) {
    try { await tx.rollback(); } catch (_) {}
    throw e;
  }
}

// ============================================================
// Initialization
// ============================================================

async function initDb() {
  if (_initialized) return;
  if (_initPromise) return _initPromise;
  _initPromise = _doInit().catch(err => { _initPromise = null; throw err; });
  return _initPromise;
}

async function _doInit() {
  client = _createClient();

  // Create schema
  await client.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS divisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, args: []
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        pin TEXT NOT NULL,
        division_id INTEGER,
        role TEXT NOT NULL DEFAULT 'karyawan' CHECK(role IN ('owner','karyawan')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (division_id) REFERENCES divisions(id)
      )`, args: []
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        report_date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, report_date)
      )`, args: []
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS report_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('completed','in_progress','next_action')),
        content TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
      )`, args: []
    },
  ], 'write');

  // Seed data
  await _seedData();

  _initialized = true;
  console.log(TURSO_URL ? '☁️  Database: Turso Cloud' : '📂 Database: Local SQLite');
}

// ============================================================
// Seed data
// ============================================================

async function _seedData() {
  const divResult = await dbGet('SELECT COUNT(*) as count FROM divisions');
  if (divResult.count === 0) {
    const divs = ['Operation & Service', 'Engineering', 'Admin & HR', 'Finance', 'Marketing', 'Management'];
    await client.batch(
      divs.map(d => ({ sql: 'INSERT INTO divisions (name) VALUES (?)', args: [d] })),
      'write'
    );
    console.log('✅ Seeded default divisions');
  }

  const ownerResult = await dbGet("SELECT COUNT(*) as count FROM users WHERE role = 'owner'");
  if (ownerResult.count === 0) {
    const mgmt = await dbGet('SELECT id FROM divisions WHERE name = ?', 'Management');
    const mgmtId = mgmt ? mgmt.id : 1;
    await dbRun(
      'INSERT INTO users (name, phone, division_id, pin, role) VALUES (?, ?, ?, ?, ?)',
      'Admin BGE', '0000', mgmtId, hashPin('1234'), 'owner'
    );
    console.log('✅ Seeded default owner (Phone: 0000, PIN: 1234)');
  }

  const empResult = await dbGet("SELECT COUNT(*) as count FROM users WHERE role = 'karyawan'");
  if (empResult.count === 0) {
    const mgmt = await dbGet('SELECT id FROM divisions WHERE name = ?', 'Management');
    const mgmtId = mgmt ? mgmt.id : 1;
    const employees = [
      { name: 'Bowo', phone: '0811', div: 'Operation & Service' },
      { name: 'Sari', phone: '0812', div: 'Engineering' },
      { name: 'Dewi', phone: '0813', div: 'Admin & HR' },
    ];
    for (const emp of employees) {
      const div = await dbGet('SELECT id FROM divisions WHERE name = ?', emp.div);
      const divId = div ? div.id : mgmtId;
      await dbRun(
        'INSERT INTO users (name, phone, division_id, pin, role) VALUES (?, ?, ?, ?, ?)',
        emp.name, emp.phone, divId, hashPin('1234'), 'karyawan'
      );
    }
    console.log('✅ Seeded default employees (Bowo: 0811, Sari: 0812, Dewi: 0813)');
  }
}

// ============================================================
// Helpers
// ============================================================

const BCRYPT_ROUNDS = 10;
function hashPin(pin) { return bcrypt.hashSync(pin, BCRYPT_ROUNDS); }
function comparePin(pin, hash) { return bcrypt.compareSync(pin, hash); }
function getToday() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); }

module.exports = { initDb, dbGet, dbAll, dbRun, dbTransaction, hashPin, comparePin, getToday };
