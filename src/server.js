import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseStatement } from './main.js';
import { CATEGORY_GROUPS, categorize, isValidCategory, normaliseKeyword } from './categories.js';
import {
  addTransactions, getAllTransactions, clearTransactions,
  createUser, getUserByName, getUserById, getAllUserIds,
  getRules, saveRule, deleteRule, recategorizeAll, setCategoryManual, getTransaction,
  PRIVATE_DIR,
} from './db.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

// Signs login cookies. Uses SESSION_SECRET from .env if set, otherwise a random
// one generated on first run and kept in private/ so logins survive restarts.
function loadSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(PRIVATE_DIR, 'session-secret');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(file, 'utf8').trim();
}

app.use(express.json());
app.use(session({
  secret: loadSessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 },
}));

// serve login.html and other static files
app.use(express.static(path.join(__dirname, '..', 'public')));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'not signed in' });
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// --- auth ---

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password || password.length < 8) {
    return res.status(400).json({ error: 'Enter a username and a password of at least 8 characters.' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const id = createUser(username.trim(), hash);
    req.session.userId = id;
    res.json({ ok: true });
  } catch (err) {
    if (String(err.code).includes('CONSTRAINT')) {
      return res.status(409).json({ error: 'That username is taken.' });
    }
    throw err;
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  const user = getUserByName((username ?? '').trim());
  const ok = user && await bcrypt.compare(password ?? '', user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Wrong username or password.' });
  req.session.userId = user.id;
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json(getUserById(req.session.userId));
});

// --- data (all require a signed-in user) ---

app.post('/api/import', requireAuth, upload.single('statement'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file uploaded' });

    const rules = getRules(req.session.userId);
    const [accepted, rejected] = await parseStatement(req.file.buffer, rules);
    const { inserted, updated } = addTransactions(req.session.userId, accepted);

    res.json({ parsed: accepted.length, inserted, updated, rejected: rejected.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'import failed: ' + err.message });
  }
});

app.get('/api/transactions', requireAuth, (req, res) => {
  res.json(getAllTransactions(req.session.userId));
});

// --- categories & rules ---

// Re-sorts all of a user's (non hand-picked) transactions with their current rules.
function recategorizeUser(userId) {
  const rules = getRules(userId);
  return recategorizeAll(userId, desc => categorize(desc, rules));
}

app.get('/api/categories', requireAuth, (req, res) => {
  res.json(CATEGORY_GROUPS);
});

app.get('/api/rules', requireAuth, (req, res) => {
  res.json(getRules(req.session.userId));
});

app.post('/api/rules', requireAuth, (req, res) => {
  const { category, wholeWord } = req.body ?? {};
  const trimmed = normaliseKeyword(req.body?.keyword ?? '').trim();
  if (trimmed.length < 2) return res.status(400).json({ error: 'Keyword must be at least 2 characters.' });
  // Whole word: " KFC " won't match inside "KFCX"
  const keyword = wholeWord ? ` ${trimmed} ` : trimmed;
  if (!isValidCategory(category)) return res.status(400).json({ error: 'Unknown category.' });

  saveRule(req.session.userId, keyword, category);
  res.json({ changed: recategorizeUser(req.session.userId) });
});

app.delete('/api/rules/:id', requireAuth, (req, res) => {
  if (!deleteRule(req.session.userId, Number(req.params.id))) {
    return res.status(404).json({ error: 'Rule not found.' });
  }
  res.json({ changed: recategorizeUser(req.session.userId) });
});

// Set one transaction's category by hand. category: null hands it back to the rules.
app.put('/api/transactions/:uid/category', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const tx = getTransaction(userId, req.params.uid);
  if (!tx) return res.status(404).json({ error: 'Transaction not found.' });

  const { category } = req.body ?? {};
  if (category === null) {
    setCategoryManual(userId, tx.uid, categorize(tx.description, getRules(userId)), false);
  } else if (isValidCategory(category)) {
    setCategoryManual(userId, tx.uid, category, true);
  } else {
    return res.status(400).json({ error: 'Unknown category.' });
  }
  res.json(getTransaction(userId, tx.uid));
});

app.post('/api/clear', requireAuth, (req, res) => {
  const deleted = clearTransactions(req.session.userId);
  res.json({ deleted });
});

// Pick up any starter-keyword or matching changes for transactions already in the database
for (const userId of getAllUserIds()) recategorizeUser(userId);

app.listen(PORT, () => console.log(`Cashflow is running: open http://localhost:${PORT}`));