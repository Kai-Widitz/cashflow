// Shared starter keywords. Each user's own keywords live in the database
// (user_rules) and always take priority over these.
import { CATEGORY_KEYWORDS } from './default-keywords.js';

// The 4 main groups, and which detailed categories sit under each.
// A transaction can also be put straight into a group (category = "Lifestyle" etc.).
const GROUPS = {
  Lifestyle: [
    'FOOD', 'DELIVERED_FOOD', 'CLIMBING', 'ACTIVITIES', 'SHOPPING',
    'GAMES', 'SUBSCRIPTIONS', 'PERSONAL_CARE',
  ],
  Essentials: [
    'GROCERIES', 'FUEL', 'PUBLIC_TRANSPORT', 'TOLLS', 'PARKING', 'CAR_SERVICE',
    'INSURANCE', 'HEALTH', 'MOBILE_DATA', 'LAUNDRY', 'EDUCATION', 'GOVERNMENT',
  ],
  Payments: ['INCOME', 'INTERNAL_TRANSFERS', 'PEER_TRANSFERS'],
  Other: [],
};

export const UNKNOWN = 'unknown';

// Any category in default-keywords.js that isn't listed above lands in Other,
// so adding a new keyword category never breaks anything.
export const CATEGORY_GROUPS = (() => {
  const groups = Object.fromEntries(Object.entries(GROUPS).map(([g, cats]) => [g, [...cats]]));
  const listed = new Set(Object.values(groups).flat());
  for (const category of Object.keys(CATEGORY_KEYWORDS)) {
    if (!listed.has(category)) groups.Other.push(category);
  }
  return groups;
})();

const VALID_CATEGORIES = new Set([
  ...Object.keys(CATEGORY_GROUPS),
  ...Object.values(CATEGORY_GROUPS).flat(),
]);

export function isValidCategory(category) {
  return VALID_CATEGORIES.has(category);
}

// Normalises a description for matching: uppercase, \ and / as spaces, single
// spaces, padded with a space each side so " KFC " can match at the start/end.
export function normaliseDesc(desc) {
  return ` ${desc.toUpperCase().replace(/[\\/]/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

// Cleans a keyword the same way as descriptions, but keeps a single leading/trailing
// space if given, since " KFC " deliberately means "the whole word KFC".
export function normaliseKeyword(keyword) {
  return String(keyword).toUpperCase().replace(/[\\/]/g, ' ').replace(/\s+/g, ' ');
}

function longestMatch(desc, entries) {
  let best = null;
  for (const [keyword, category] of entries) {
    if (desc.includes(keyword) && (!best || keyword.length > best[0].length)) {
      best = [keyword, category];
    }
  }
  return best?.[1] ?? null;
}

const DEFAULT_ENTRIES = Object.entries(CATEGORY_KEYWORDS).flatMap(
  ([category, keywords]) => keywords.map(k => [k.toUpperCase(), category])
);

// The user's own rules win over the defaults; within each, the longest keyword wins.
// `userRules` is a list of { keyword, category }.
export function categorize(desc, userRules = []) {
  const normalised = normaliseDesc(desc);
  const userEntries = userRules.map(r => [r.keyword.toUpperCase(), r.category]);
  return longestMatch(normalised, userEntries)
    ?? longestMatch(normalised, DEFAULT_ENTRIES)
    ?? UNKNOWN;
}
