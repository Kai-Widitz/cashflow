import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractLines, extractTransactions } from './main.js';
import {
  addTransactions, getAllTransactions, clearTransactions,
  createUser, getUserByName, getUserById,
} from './db.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(session({
  secret: 'change-this-to-anything-random',
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

    const lines = await extractLines(req.file.buffer);
    const [accepted, rejected] = extractTransactions(lines);
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

app.post('/api/clear', requireAuth, (req, res) => {
  const deleted = clearTransactions(req.session.userId);
  res.json({ deleted });
});

app.listen(3000, () => console.log('http://localhost:3000'));