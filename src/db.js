import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '..', 'private', 'transactions.db'));

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
`);

const stmts = {
  insert: db.prepare(`
    INSERT INTO transactions (user_id, uid, date, description, amount, category)
    VALUES (@user_id, @uid, @date, @description, @amount, @category)
    ON CONFLICT(user_id, uid) DO UPDATE SET
        date        = excluded.date,
        description = excluded.description,
        amount      = excluded.amount,
        category    = excluded.category
  `),
  getOne: db.prepare(`SELECT * FROM transactions WHERE user_id = ? AND uid = ?`),
  getAll: db.prepare(`SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC`),
  remove: db.prepare(`DELETE FROM transactions WHERE user_id = ? AND uid = ?`),
  updateCategory: db.prepare(`UPDATE transactions SET category = ? WHERE user_id = ? AND uid = ?`),
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
  return { ...row, date: new Date(row.date) };
}

// --- users ---

export function createUser(username, passwordHash) {
  return stmts.createUser.run(username, passwordHash).lastInsertRowid;
}

export function getUserByName(username) {
  return stmts.userByName.get(username);
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

export function countTransactions(userId) {
  return stmts.count.get(userId).n;
}

export function clearTransactions(userId) {
  return stmts.clear.run(userId).changes;
}

export default db;