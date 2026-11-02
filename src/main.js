import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createHash } from 'crypto';
import { categorize } from './categories.js';

// Constants
const PDF_X_LOWER_LIMIT_DEPOSITS = 500;
const PDF_Y_DELTA_LINE_LIMIT = 15;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Classes
class Transaction {
  constructor(date, description, amount, category, uid) {
    this.date = date;
    this.description = description;
    this.amount = amount;
    this.category = category;
    this.uid = uid;
  }
}

// --- entry point ---

// Reads a statement PDF, works out which bank it's from, and returns [accepted, rejected].
// `userRules` ({ keyword, category }[]) take priority over the starter keywords.
export async function parseStatement(dataBuffer, userRules = []) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(dataBuffer) }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    pages.push((await page.getTextContent()).items);
  }

  const [accepted, rejected] = isAmexStatement(pages)
    ? extractAmexTransactions(pages)
    : extractAnzTransactions(groupAnzLines(pages));
  for (const t of accepted) t.category = categorize(t.description, userRules);
  return [accepted, rejected];
}

// Matches the AMEX page header / card name rather than any mention of "American Express",
// so an ANZ statement with a payment to an AMEX card isn't misdetected.
function isAmexStatement(pages) {
  return pages.some(items => items.some(item =>
    /^Card Activity Since/.test(item.str) || /^The American Express/.test(item.str)
  ));
}

// --- shared helpers ---

// Builds a Transaction with a uid (category is filled in by parseStatement).
// `seen` tracks duplicate uids within one import.
function makeTransaction(date, desc, amount, seen) {
  let uid = createHash('sha256')
    .update(`${date.toISOString()}|${desc}|${amount}`)
    .digest('hex')
    .slice(0, 32);
  if (uid in seen) {
    seen[uid] += 1;
    uid = uid + "-" + String(seen[uid]);
  } else {
    seen[uid] = 0;
  }
  return new Transaction(date, desc, amount, null, uid);
}

// Parses "1 NOV" / "01 Nov" into a local-midnight Date in the given year.
// Returns null for anything that isn't a valid day + month (e.g. "31 FEB").
function parseDayMoStr(dateStr, year) {
  const match = dateStr.trim().toUpperCase().match(/^(\d{1,2})\s([A-Z]{3})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTHS.indexOf(match[2]);
  if (month === -1) return null;
  const date = new Date(year, month, day);
  if (date.getDate() !== day) return null;
  return date;
}

// --- ANZ ---

// Groups PDF text items into lines. Each line is [cells, "deposit" | "withdrawal"],
// where the type comes from which column the amount sits in.
function groupAnzLines(pages) {
  const lines = [];
  const isAmount = (str) => /^\$[\d,]+\.\d{2}$/.test(str);

  for (const items of pages) {
    let line = [];
    let lineType = "withdrawal";
    let lastY;
    for (const item of items) {
      const str = item.str.trim();
      if (str === '') continue;
      const y = item.transform[5];
      const x = item.transform[4];

      if (lastY !== undefined && Math.abs(y - lastY) > PDF_Y_DELTA_LINE_LIMIT) {
        if (line.length > 0) lines.push([line, lineType]);
        line = [];
      }
      if (str !== 'blank') line.push(str);
      lastY = y;

      if (isAmount(str)) {
        lineType = x >= PDF_X_LOWER_LIMIT_DEPOSITS ? "deposit" : "withdrawal";
      }
    }
    if (line.length > 0) lines.push([line, lineType]);
  }
  return lines;
}

function extractAnzTransactions(lines) {
  const accepted = [];
  const rejected = [];
  const year = new Date().getFullYear();
  const seen = {};

  for (const [line, transactionType] of lines) {
    if (line.length !== 3) continue;
    const [dateStr, descStr, amountStr] = line;

    const date = parseDayMoStr(dateStr, year);
    const amountMatch = amountStr.match(/^\$([\d,]+\.\d{2})$/);
    if (!date || !amountMatch) {
      rejected.push(line);
      continue;
    }

    let amount = Number(amountMatch[1].replace(/,/g, ''));
    if (transactionType === "withdrawal") amount *= -1;

    accepted.push(makeTransaction(date, descStr, amount, seen));
  }
  return [accepted, rejected];
}

// --- AMEX ---

// AMEX rows look like: DATE | [STATUS] | DESCRIPTION | AMOUNT
// e.g. "1 Nov" | "Pending" | "DA MARIO NEXT DOOR" | "$32.00"
// Charges are positive and credits/payments negative, so signs are flipped
// to match the app (money out = negative, money in = positive).
const AMEX_STATUSES = ['Pending', 'Credit'];
const AMEX_AMOUNT = /^(-)?\$([\d,]+\.\d{2})$/;

function extractAmexTransactions(pages) {
  const accepted = [];
  const rejected = [];
  const seen = {};
  // Statements have no year. Rows run newest to oldest, so the newest is assumed
  // to be this year, and we step back a year each time the month jumps forward
  // (e.g. Jan -> Dec).
  let year = new Date().getFullYear();
  let prevMonth = null;

  for (const items of pages) {
    // Group text items into rows by their y position
    const rows = new Map();
    for (const item of items) {
      const str = item.str.trim();
      if (str === '') continue;
      const y = Math.round(item.transform[5]);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: item.transform[4], str });
    }

    for (const row of rows.values()) {
      row.sort((a, b) => a.x - b.x);
      const cells = row.map(c => c.str);

      // Only rows that start with a date and end with an amount are transactions
      const amountMatch = cells[cells.length - 1].match(AMEX_AMOUNT);
      const date = parseDayMoStr(cells[0], year);
      if (cells.length < 3 || !amountMatch || !date) {
        // Skip headers/footers silently; only report rows that looked like transactions
        if (date || amountMatch) rejected.push(cells);
        continue;
      }

      if (prevMonth !== null && date.getMonth() > prevMonth) {
        year -= 1;
        date.setFullYear(year);
      }
      prevMonth = date.getMonth();

      let middle = cells.slice(1, -1);
      let status = null;
      if (middle.length > 1 && AMEX_STATUSES.includes(middle[0])) {
        status = middle[0];
        middle = middle.slice(1);
      }
      // Pending charges get re-posted later (often with a different
      // description), so importing them now would create duplicates.
      if (status === 'Pending') {
        rejected.push(cells);
        continue;
      }

      const desc = middle.join(' ');
      const [, negative, digits] = amountMatch;
      let amount = Number(digits.replace(/,/g, ''));
      if (!negative) amount *= -1;

      accepted.push(makeTransaction(date, desc, amount, seen));
    }
  }
  return [accepted, rejected];
}
