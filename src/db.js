import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '..', 'private', 'transactions.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    uid         TEXT PRIMARY KEY,
    date        TEXT NOT NULL,
    description TEXT NOT NULL,
    amount      REAL NOT NULL,
    category    TEXT NOT NULL,
    imported_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
`);

const stmts = {
  insert: db.prepare(`
    INSERT INTO transactions (uid, date, description, amount, category)
    VALUES (@uid, @date, @description, @amount, @category)
    ON CONFLICT(uid) DO NOTHING
  `),
  remove: db.prepare(`DELETE FROM transactions WHERE uid = ?`),
  getOne: db.prepare(`SELECT * FROM transactions WHERE uid = ?`),
  getAll: db.prepare(`SELECT * FROM transactions ORDER BY date DESC`),
  updateCategory: db.prepare(`
    UPDATE transactions SET category = ? WHERE uid = ?
  `),
  count: db.prepare(`SELECT COUNT(*) AS n FROM transactions`),
};

function toRow(t) {
  return {
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

// Returns true if a new row was written, false if the uid was already present.
export function addTransaction(transaction) {
  return stmts.insert.run(toRow(transaction)).changes > 0;
}

// Batch insert in a single db transaction. Returns { inserted, skipped }.
export const addTransactions = db.transaction((transactions) => {
  let inserted = 0;
  for (const t of transactions) {
    inserted += stmts.insert.run(toRow(t)).changes;
  }
  return { inserted, skipped: transactions.length - inserted };
});

// Returns true if a row was deleted, false if the uid was not found.
export function removeTransaction(uid) {
  return stmts.remove.run(uid).changes > 0;
}

export function getTransaction(uid) {
  return toTransaction(stmts.getOne.get(uid));
}

export function getAllTransactions() {
  return stmts.getAll.all().map(toTransaction);
}

export function hasTransaction(uid) {
  return stmts.getOne.get(uid) !== undefined;
}

export function countTransactions() {
  return stmts.count.get().n;
}

export function setCategory(uid, category) {
  return stmts.updateCategory.run(category, uid).changes > 0;
}

export default db;