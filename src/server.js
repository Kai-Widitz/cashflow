import express from 'express';
import multer from 'multer';
import { extractLines, extractTransactions } from './main.js';
import { addTransactions, getAllTransactions, clearTransactions  } from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, '..', 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.post('/api/import', upload.single('statement'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file uploaded' });

    const lines = await extractLines(req.file.buffer);
    const [accepted, rejected] = extractTransactions(lines);
    const { inserted, skipped } = addTransactions(accepted);

    res.json({ parsed: accepted.length, inserted, skipped, rejected: rejected.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'import failed: ' + err.message });
  }
});

app.get('/api/transactions', (req, res) => {
  res.json(getAllTransactions());
});

app.listen(3000, () => console.log('http://localhost:3000'));

app.post('/api/clear', (req, res) => {
  const deleted = clearTransactions();
  res.json({ deleted });
});