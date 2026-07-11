const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// --- Database file path ---
const DB_PATH = process.env.VERCEL
  ? path.join('/tmp', 'daily_report.db')
  : path.join(__dirname, 'data', 'daily_report.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// --- Internal state ---
let _wrapper = null;
let _initPromise = null;

// ============================================================
// Compatibility wrapper: provides better-sqlite3 API on sql.js
// ============================================================
class SqlJsWrapper {
  constructor(rawDb, dbPath) {
    this._raw = rawDb;
    this._dbPath = dbPath;
    this._inTransaction = false;
  }

  prepare(sql) {
    const self = this;
    return {
      get(...params) {
        const stmt = self._raw.prepare(sql);
        try {
          if (params.length > 0) stmt.bind(params);
          if (stmt.step()) {
            return stmt.getAsObject();
          }
          return undefined;
        } finally {
          stmt.free();
        }
      },

      all(...params) {
        const stmt = self._raw.prepare(sql);
        try {
          if (params.length > 0) stmt.bind(params);
          const results = [];
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          return results;
        } finally {
          stmt.free();
        }
      },

      run(...params) {
        self._raw.run(sql, params);
        const lastResult = self._raw.exec('SELECT last_insert_rowid() as id');
        const lastInsertRowid = lastResult.length > 0 ? lastResult[0].values[0][0] : 0;
        const changes = self._raw.getRowsModified();
        if (!self._inTransaction) self._save();
        return { lastInsertRowid, changes };
      }
    };
  }

  exec(sql) {
    this._raw.exec(sql);
    if (!this._inTransaction) this._save();
  }

  pragma(str) {
    try {
      this._raw.exec(`PRAGMA ${str}`);
    } catch (e) {
      // sql.js doesn't support all pragmas (e.g. WAL mode) — ignore
    }
  }

  transaction(fn) {
    const self = this;
    return function (...args) {
      self._inTransaction = true;
      self._raw.run('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        self._raw.run('COMMIT');
        self._inTransaction = false;
        self._save();
        return result;
      } catch (e) {
        self._raw.run('ROLLBACK');
        self._inTransaction = false;
        throw e;
      }
    };
  }

  _save() {
    try {
      const data = this._raw.export();
      fs.writeFileSync(this._dbPath, Buffer.from(data));
    } catch (e) {
      console.error('⚠️ Failed to save database:', e.message);
    }
  }
}

// ============================================================
// Proxy: lets code use `db.prepare(...)` even though init is async
// ============================================================
const db = new Proxy({}, {
  get(_target, prop) {
    if (!_wrapper) throw new Error('Database not initialized. Ensure initDb() was called.');
    const val = _wrapper[prop];
    if (typeof val === 'function') return val.bind(_wrapper);
    return val;
  }
});

// ============================================================
// Async initialization
// ============================================================
async function initDb() {
  if (_wrapper) return _wrapper;
  if (_initPromise) return _initPromise;
  _initPromise = _doInit().catch(err => {
    _initPromise = null; // allow retry on next call
    throw err;
  });
  return _initPromise;
}

async function _doInit() {
  // Load sql.js WASM
  const SQL = await initSqlJs();

  // Clean up old WAL/SHM files from previous better-sqlite3 usage
  for (const ext of ['-wal', '-shm']) {
    const p = DB_PATH + ext;
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (_) {}
    }
  }

  // Open or create database
  let rawDb;
  try {
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      rawDb = new SQL.Database(buffer);
    } else {
      rawDb = new SQL.Database();
    }
  } catch (e) {
    console.warn('⚠️ Could not load existing database, creating a new one.');
    rawDb = new SQL.Database();
  }

  _wrapper = new SqlJsWrapper(rawDb, DB_PATH);

  // Enable foreign keys
  _wrapper.pragma('foreign_keys = ON');

  // --- Schema ---
  _wrapper.exec(`
    CREATE TABLE IF NOT EXISTS divisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      pin TEXT NOT NULL,
      division_id INTEGER,
      role TEXT NOT NULL DEFAULT 'karyawan' CHECK(role IN ('owner', 'karyawan')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (division_id) REFERENCES divisions(id)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      report_date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, report_date)
    );

    CREATE TABLE IF NOT EXISTS report_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('completed', 'in_progress', 'next_action')),
      content TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    );
  `);

  // Seed data
  _seedData();

  console.log(`📂 Database: ${DB_PATH}`);
  return _wrapper;
}

// ============================================================
// Helpers
// ============================================================
const BCRYPT_ROUNDS = 10;

function hashPin(pin) {
  return bcrypt.hashSync(pin, BCRYPT_ROUNDS);
}

function comparePin(pin, hash) {
  return bcrypt.compareSync(pin, hash);
}

function getToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

// ============================================================
// Seed data
// ============================================================
function _seedData() {
  const divisionCount = _wrapper.prepare('SELECT COUNT(*) as count FROM divisions').get().count;

  if (divisionCount === 0) {
    const insertDiv = _wrapper.prepare('INSERT INTO divisions (name) VALUES (?)');
    const defaultDivisions = [
      'Operation & Service',
      'Engineering',
      'Admin & HR',
      'Finance',
      'Marketing',
      'Management'
    ];
    for (const div of defaultDivisions) {
      insertDiv.run(div);
    }
    console.log('✅ Seeded default divisions');
  }

  const ownerCount = _wrapper.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'owner'").get().count;

  if (ownerCount === 0) {
    const mgmtDiv = _wrapper.prepare('SELECT id FROM divisions WHERE name = ?').get('Management');
    const mgmtId = mgmtDiv ? mgmtDiv.id : 1;

    _wrapper.prepare(
      'INSERT INTO users (name, phone, division_id, pin, role) VALUES (?, ?, ?, ?, ?)'
    ).run('Admin BGE', '0000', mgmtId, hashPin('1234'), 'owner');
    console.log('✅ Seeded default owner (Phone: 0000, PIN: 1234)');
  }

  const employeeCount = _wrapper.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'karyawan'").get().count;

  if (employeeCount === 0) {
    const mgmtDiv = _wrapper.prepare('SELECT id FROM divisions WHERE name = ?').get('Management');
    const mgmtId = mgmtDiv ? mgmtDiv.id : 1;

    const employees = [
      { name: 'Bowo', phone: '0811', div: 'Operation & Service' },
      { name: 'Sari', phone: '0812', div: 'Engineering' },
      { name: 'Dewi', phone: '0813', div: 'Admin & HR' }
    ];

    const insertUser = _wrapper.prepare(
      'INSERT INTO users (name, phone, division_id, pin, role) VALUES (?, ?, ?, ?, ?)'
    );

    for (const emp of employees) {
      const div = _wrapper.prepare('SELECT id FROM divisions WHERE name = ?').get(emp.div);
      const divId = div ? div.id : mgmtId;
      insertUser.run(emp.name, emp.phone, divId, hashPin('1234'), 'karyawan');
    }
    console.log('✅ Seeded default employees (Bowo: 0811, Sari: 0812, Dewi: 0813)');
  }
}

module.exports = { db, initDb, hashPin, comparePin, getToday };
