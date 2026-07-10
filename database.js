const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.VERCEL
  ? path.join('/tmp', 'daily_report.db')
  : path.join(__dirname, 'data', 'daily_report.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema ---
db.exec(`
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

// --- Helper: Hash PIN with bcrypt ---
const BCRYPT_ROUNDS = 10;

function hashPin(pin) {
  return bcrypt.hashSync(pin, BCRYPT_ROUNDS);
}

function comparePin(pin, hash) {
  return bcrypt.compareSync(pin, hash);
}

// --- Helper: Get today's date in Asia/Jakarta timezone ---
function getToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

// --- Seed Data ---
function seedData() {
  const divisionCount = db.prepare('SELECT COUNT(*) as count FROM divisions').get().count;

  if (divisionCount === 0) {
    const insertDiv = db.prepare('INSERT INTO divisions (name) VALUES (?)');
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

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;

  if (userCount === 0) {
    const mgmtDiv = db.prepare('SELECT id FROM divisions WHERE name = ?').get('Management');
    db.prepare(
      'INSERT INTO users (name, phone, division_id, pin, role) VALUES (?, ?, ?, ?, ?)'
    ).run('Admin BGE', '0000', mgmtDiv ? mgmtDiv.id : 1, hashPin('1234'), 'owner');
    console.log('✅ Seeded default owner (Phone: 0000, PIN: 1234)');
  }
}

seedData();

module.exports = { db, hashPin, comparePin, getToday };
