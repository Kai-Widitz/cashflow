# Cashflow

A local tool for turning bank statement PDFs into a searchable, categorised transaction database with spending charts. Runs entirely on your own machine, so no data leaves the computer.

> **Disclaimer:** Cashflow is a personal hobby project, not financial software. It can misread statements, miss transactions, or put them in the wrong category, so its totals and charts may be wrong. Don't rely on it for financial, tax or legal decisions. Always check against your official bank statements. It's provided as-is, with no warranty.

## What it does

- Reads transactions out of statement PDFs (date, description, amount)
- Supports **ANZ transaction reports** and **AMEX card activity** pages saved as PDF
- Sorts each transaction into a category, grouped under **Lifestyle**, **Essentials**, **Payments** and **Other**
- Learns your own keywords: unknown shops are shown one at a time so you can sort them, and each choice is remembered for future imports
- Stores everything in SQLite, deduplicated so re-importing the same statement is safe
- Shows totals, a spending-by-category pie chart and a spending-over-time chart
- Separate accounts, so several people can use one copy, each with their own transactions and keywords

## Running it on your computer

### 1. Install Node.js (once)

Download the **LTS** version from https://nodejs.org and install it with the default options. You need version 22 or later.

### 2. Get the project

On the GitHub page, click **Code → Download ZIP**, then unzip it somewhere easy to find, such as your Desktop or Documents. If you use git, `git clone` works too.

### 3. Start it

**Windows**

Open the project folder and double-click **`start.bat`**. A black command window opens.

**macOS / Linux**

Open Terminal, go to the project folder, and run:

```bash
sh start.sh
```

(Tip for macOS: type `cd ` with a trailing space, drag the folder into the Terminal window, then press Enter.)

The **first time**, it installs what it needs, which takes a minute or two. After that it starts in a few seconds.

### 4. Use it

Your browser opens **http://localhost:3000** by itself. If it doesn't, open that address yourself.

1. Click the **Create account** tab and make an account. It only exists on this computer.
2. Choose a statement PDF and click **Import**.
3. Sort any shops it doesn't recognise in the **Sort your spending** card.

### 5. Stop it

- **Windows:** close the black command window.
- **macOS / Linux:** press **Ctrl+C** in Terminal.

Your data is saved, so next time just start it again (step 3).

### Troubleshooting

| Problem | Fix |
|---|---|
| "Node.js is not installed" right after installing it | Close the window and run `start.bat` / `start.sh` again. If it still fails, restart the computer. |
| Windows shows "Windows protected your PC" | Click **More info → Run anyway**. It shows this for any downloaded script. |
| Install fails on the first run | Check you're online and on Node.js 22 or later, delete the `node_modules` folder, and try again. |
| "address already in use" / port 3000 error | Cashflow (or something else) is already running. Close the other window, or set a different port in `.env` (see Settings below). |
| Statement imports with 0 transactions | That statement format isn't supported yet. See the formats listed under What it does. |
| Forgot your password | There's no reset yet. Delete `private/transactions.db` to start fresh, which deletes all accounts and data. |

### Updating to a new version

Download the new version and copy your old **`private/`** folder into it, which keeps your accounts, transactions and keywords. If you used git, `git pull` is enough. Delete `node_modules` first if the update changed `package.json`.

## Categories and keywords

Each transaction is matched by keywords in its description:

1. **Your keywords** are saved to your account in the database. Add them from the **Sort your spending** card, or from **Your keywords** under the import form. They always win.
2. **Starter keywords** in `src/default-keywords.js` cover common Australian shops (Woolworths, Coles, Opal, etc.) for everyone.

Anything unmatched shows as **Unsorted** until you sort it. To fix a single transaction without making a keyword, click its category in the table.

Matching ignores case, treats `\` and `/` as spaces, and when several keywords match, the longest wins. Tick "Whole word only" so a short keyword like `BP` doesn't match inside other words.

The four groups, and which categories sit under each, are defined in `src/categories.js`.

### Importing a keyword file

If you have keywords in a file (exporting `CATEGORY_KEYWORDS`, shaped like `src/default-keywords.js`), you can load them into an account:

```bash
node scripts/import-keywords.js <username> path/to/keywords.js
```

## Where data is kept

Everything personal lives in the `private/` folder, which is not in git:

- `private/transactions.db`: accounts, transactions and keywords
- `private/session-secret`: signs login cookies, created automatically

Back up `private/` to keep your data, and delete it to start fresh.

## Settings (optional)

Create a `.env` file in the project folder to change these:

```
PORT=3000
SESSION_SECRET=some-long-random-string
```

## Development

```bash
npm install
npm run dev    # restarts automatically when files change
```
