#!/bin/sh
# Run Cashflow on macOS or Linux: ./start.sh
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download the LTS version from https://nodejs.org, install it, then run this again."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First run: installing dependencies, this takes a minute..."
  npm install || { echo "Install failed, see the messages above."; exit 1; }
fi

# Open the browser a few seconds after the server starts
(sleep 3 && (open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null)) &
echo "Press Ctrl+C to stop Cashflow."
npm start
