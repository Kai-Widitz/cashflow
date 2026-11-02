// Imports a keyword file into one user's saved keywords in the database.
//
//   node scripts/import-keywords.js <username> <path/to/keywords.js>
//
// The file should export CATEGORY_KEYWORDS = { CATEGORY: ['KEYWORD', ...], ... }
// (the same shape as src/default-keywords.js). Existing keywords with the same
// text are updated; nothing is deleted.
import path from 'path';
import { pathToFileURL } from 'url';
import { getUserByName, saveRule, getRules, recategorizeAll } from '../src/db.js';
import { categorize, isValidCategory, normaliseKeyword } from '../src/categories.js';

const [username, file] = process.argv.slice(2);
if (!username || !file) {
  console.log('Usage: node scripts/import-keywords.js <username> <path/to/keywords.js>');
  process.exit(1);
}

const user = getUserByName(username);
if (!user) {
  console.log(`No user called "${username}". Sign up in the app first.`);
  process.exit(1);
}

const { CATEGORY_KEYWORDS } = await import(pathToFileURL(path.resolve(file)).href);
if (!CATEGORY_KEYWORDS) {
  console.log(`${file} doesn't export CATEGORY_KEYWORDS.`);
  process.exit(1);
}

let imported = 0;
const skipped = [];
for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
  if (!isValidCategory(category)) {
    skipped.push(`${category} (unknown category; add it to a group in src/categories.js)`);
    continue;
  }
  for (const raw of keywords) {
    const keyword = normaliseKeyword(raw);
    if (keyword.trim().length < 2) {
      skipped.push(`"${raw}" (too short)`);
      continue;
    }
    saveRule(user.id, keyword, category);
    imported++;
  }
}

const rules = getRules(user.id);
const changed = recategorizeAll(user.id, desc => categorize(desc, rules));

console.log(`Imported ${imported} keywords for ${username}; ${changed} transactions re-sorted.`);
if (skipped.length) console.log('Skipped:\n  ' + skipped.join('\n  '));
