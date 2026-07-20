# Cashflow

A local tool for turning bank statement PDFs into a searchable, categorised transaction database with spending charts. Runs entirely on your own machine, no accounts and no data leaving the computer.

## What it does

- Parses transactions out of bank statement PDFs (date, description, amount)
- Classifies deposits and withdrawals
- Assigns a category to each transaction from a keyword list
- Stores everything in SQLite, deduplicated so re-importing the same statement is safe
- Serves a small web UI with totals, a spending-by-category pie chart, and a spending-over-time chart

## Requirements

- Node.js 22 or later
- An ANZ transaction statement

## Setup

```bash
npm install
```

Then create `private/keywords.js`, which is required and not in the repository, since bank descriptions tend to be personally identifying. It exports a map of category name to the list of substrings that identify it:

```javascript
export const CATEGORY_KEYWORDS = {
  GROCERIES: ['WOOLWORTHS', 'COLES', 'ALDI', 'IGA'],
  FUEL: ['AMPOL', 'BP ', 'SHELL', '7-ELEVEN'],
  DELIVERED_FOOD: ['UBER EATS', 'DOORDASH', 'MENULOG'],
  PUBLIC_TRANSPORT: ['OPAL', 'TRANSPORTFORNSW'],
  SUBSCRIPTIONS: ['SPOTIFY', 'NETFLIX', 'ADOBE'],
  INTERNAL_TRANSFERS: ['FUNDS TRANSFER'],
};
```

Matching is case insensitive and checks whether the keyword appears anywhere in the description. The first category with a match wins, so put more specific categories above broader ones. Anything unmatched becomes `unknown`, which shows up as its own slice in the pie chart and is the quickest way to find keywords worth adding.

Then start the server:

```bash
npm run dev
```

Open http://localhost:3000.

Upload a PDF, and the parsed transactions appear in the table below along with the charts.

