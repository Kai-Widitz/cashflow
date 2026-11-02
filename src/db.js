import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PRIVATE_DIR = path.join(__dirname, '..', 'private');
fs.mkdirSync(PRIVATE_DIR, { recursive: true });
const db = new Database(path.join(PRIVATE_DIR, 'transactions.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    user_id     INTEGER NOT NULL REFERENCES users(id),
    uid         TEXT NOT NULL,
    date        TEXT NOT NULL,
    description TEXT NOT NULL,
    amount      REAL NOT NULL,
    category    TEXT NOT NULL,
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, uid)
  );
  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);

  -- A user's own "description contains KEYWORD -> CATEGORY" rules
  CREATE TABLE IF NOT EXISTS user_rules (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    keyword    TEXT NOT NULL,
    category   TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, keyword)
  );
`);

// Older databases don't have this column. When set, the category was picked by
// hand and is left alone by re-imports and rule changes.
const txColumns = db.prepare(`PRAGMA table_info(transactions)`).all().map(c => c.name);
if (!txColumns.includes('category_locked')) {
  db.exec(`ALTER TABLE transactions ADD COLUMN category_locked INTEGER NOT NULL DEFAULT 0`);
}

const stmts = {
  insert: db.prepare(`
    INSERT INTO transactions (user_id, uid, date, description, amount, category)
    VALUES (@user_id, @uid, @date, @description, @amount, @category)
    ON CONFLICT(user_id, uid) DO UPDATE SET
        date        = excluded.date,
        description = excluded.description,
        amount      = excluded.amount,
        category    = CASE WHEN category_locked THEN category ELSE excluded.category END
  `),
  getOne: db.prepare(`SELECT * FROM transactions WHERE user_id = ? AND uid = ?`),
  getAll: db.prepare(`SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC`),
  remove: db.prepare(`DELETE FROM transactions WHERE user_id = ? AND uid = ?`),
  updateCategory: db.prepare(`UPDATE transactions SET category = ? WHERE user_id = ? AND uid = ?`),
  setCategoryLocked: db.prepare(`
    UPDATE transactions SET category = ?, category_locked = ? WHERE user_id = ? AND uid = ?
  `),
  getUnlocked: db.prepare(`
    SELECT uid, description, category FROM transactions WHERE user_id = ? AND category_locked = 0
  `),

  getRules: db.prepare(`SELECT id, keyword, category FROM user_rules WHERE user_id = ? ORDER BY keyword`),
  upsertRule: db.prepare(`
    INSERT INTO user_rules (user_id, keyword, category) VALUES (?, ?, ?)
    ON CONFLICT(user_id, keyword) DO UPDATE SET category = excluded.category
  `),
  deleteRule: db.prepare(`DELETE FROM user_rules WHERE user_id = ? AND id = ?`),
  count: db.prepare(`SELECT COUNT(*) AS n FROM transactions WHERE user_id = ?`),
  clear: db.prepare(`DELETE FROM transactions WHERE user_id = ?`),

  createUser: db.prepare(`INSERT INTO users (username, password_hash) VALUES (?, ?)`),
  userByName: db.prepare(`SELECT * FROM users WHERE username = ?`),
  userById: db.prepare(`SELECT id, username FROM users WHERE id = ?`),
};

function toRow(userId, t) {
  return {
    user_id: userId,
    uid: t.uid,
    date: t.date instanceof Date ? t.date.toISOString() : t.date,
    description: t.description,
    amount: t.amount,
    category: t.category,
  };
}

function toTransaction(row) {
  if (!row) return null;
  return { ...row, date: new Date(row.date), category_locked: !!row.category_locked };
}

// --- users ---

export function createUser(username, passwordHash) {
  return stmts.createUser.run(username, passwordHash).lastInsertRowid;
}

export function getUserByName(username) {
  return stmts.userByName.get(username);
}

export function getAllUserIds() {
  return db.prepare(`SELECT id FROM users`).all().map(r => r.id);
}

export function getUserById(id) {
  return stmts.userById.get(id);
}

// --- transactions (all scoped to a user) ---

export const addTransactions = db.transaction((userId, transactions) => {
  let inserted = 0;
  let updated = 0;
  for (const t of transactions) {
    const existed = stmts.getOne.get(userId, t.uid) !== undefined;
    stmts.insert.run(toRow(userId, t));
    existed ? updated++ : inserted++;
  }
  return { inserted, updated, skipped: 0 };
});

export function getAllTransactions(userId) {
  return stmts.getAll.all(userId).map(toTransaction);
}

export function getTransaction(userId, uid) {
  return toTransaction(stmts.getOne.get(userId, uid));
}

export function removeTransaction(userId, uid) {
  return stmts.remove.run(userId, uid).changes > 0;
}

export function setCategory(userId, uid, category) {
  return stmts.updateCategory.run(category, userId, uid).changes > 0;
}

// Sets a category by hand (locked), or pass locked=false to hand it back to the rules.
export function setCategoryManual(userId, uid, category, locked) {
  return stmts.setCategoryLocked.run(category, locked ? 1 : 0, userId, uid).changes > 0;
}

// Re-runs `categorize(description)` over every transaction not set by hand.
// Returns how many changed.
export const recategorizeAll = db.transaction((userId, categorize) => {
  let changed = 0;
  for (const row of stmts.getUnlocked.all(userId)) {
    const category = categorize(row.description);
    if (category !== row.category) {
      stmts.updateCategory.run(category, userId, row.uid);
      changed++;
    }
  }
  return changed;
});

// --- user rules ---

export function getRules(userId) {
  return stmts.getRules.all(userId);
}

export function saveRule(userId, keyword, category) {
  stmts.upsertRule.run(userId, keyword, category);
}

export function deleteRule(userId, id) {
  return stmts.deleteRule.run(userId, id).changes > 0;
}

export function countTransactions(userId) {
  return stmts.count.get(userId).n;
}

export function clearTransactions(userId) {
  return stmts.clear.run(userId).changes;
}

export default db;