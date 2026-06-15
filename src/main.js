import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { categorizeBatch } from './AI.js';

// Constants
const PDF_X_LOWER_LIMIT_DEPOSITS = 500;
const PDF_Y_DELTA_LINE_LIMIT = 15;

// Classes
class Transaction {
  constructor(date, description, amount, category) {
    this.date = date;
    this.description = description;
    this.amount = amount;
    this.category = category;
  }
}

// Functions
async function extractLines(filePath) {
  const dataBuffer = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await pdfjsLib.getDocument({ data: dataBuffer }).promise;

  let lines = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    let lastY;
    let line = [];
    let lastLineType = "withdrawal";
    let lastX;
    for (let item of textContent.items) {
        if (item.str.trim() === '') continue;
        if (lastY !== undefined && Math.abs(item.transform[5] - lastY) > PDF_Y_DELTA_LINE_LIMIT && lastX !== undefined) {
            if (line.length > 0 && line != "blank") {
                lines.push([line, lastLineType]);
            }
            line = [];
        }
        if (item.str.trim() != 'blank') {
            line.push(item.str.trim());
        }
        lastY = item.transform[5];
        lastX = item.transform[4];

        const isAmount = (str) => /^\$[\d,]+\.\d{2}$/.test(str);
        if (isAmount(item.str.trim())) {
            if (lastX >= PDF_X_LOWER_LIMIT_DEPOSITS) {
                lastLineType = "deposit";
            } else {
                lastLineType = "withdrawal";
            }
        }
    }
    if (line.length > 0) lines.push(line);
  }
  return lines;
}

async function extractTransactions(lines) {
    const accepted = [];
    const rejected = [];
    const year = new Date().getFullYear();
    const pendingDescriptions = [];
    const pendingTransactions = [];

    for (let lineData of lines) {
        const [line, transactionType] = lineData;
        if (line.length == 3) {
            let dateStr = line[0];
            const descStr = line[1];
            let amountStr = line[2];

            const dateFinal = parseDayMoStr(dateStr, year);
            if (dateFinal == null) { rejected.push(line); continue; }
            if (amountStr.length < 2) { rejected.push(line); continue; }

            amountStr = amountStr.slice(1).replace(/,/g, '');
            const isOnlyDigits = (str) => /^\d+(\.\d+)?$/.test(str);
            if (!isOnlyDigits(amountStr)) { rejected.push(line); continue; }

            let amountFinal = Number(amountStr);
            if (transactionType == "withdrawal") amountFinal *= -1;

            pendingDescriptions.push(descStr);
            pendingTransactions.push({ dateFinal, descStr, amountFinal });
        }
    }

    const categories = await categorizeBatch(pendingDescriptions);

    for (let i = 0; i < pendingTransactions.length; i++) {
        const { dateFinal, descStr, amountFinal } = pendingTransactions[i];
        accepted.push(new Transaction(dateFinal, descStr, amountFinal, categories[i] ?? 'unknown'));
    }

    return [accepted, rejected];
}

function parseDayMoStr(dateStr, year) {
    const regex = /^(\d{1,2})\s([A-Z]{3})$/;
    dateStr = dateStr.trim().match(regex);
    if (!dateStr) {
        return null;
    }
    const [, day, month] = dateStr;
    const date = new Date(`${day} ${month} ${year}`);
    if (isNaN(date.getTime())) {
        return null;
    }
    return date;
}

// test
extractLines('uploads/test.pdf').then(async (lines) => {
    let acceptedTs = (await extractTransactions(lines))[0];
    console.log(acceptedTs)
    let byCategory = {};
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    for (let ts of acceptedTs) {
        if (ts.category != "INTERNAL_TRANSFERS") {
            if (ts.amount < 0) {
                totalWithdrawals -= ts.amount;
                if (ts.category in byCategory) {
                    byCategory[ts.category] -= ts.amount;
                } else {
                    byCategory[ts.category] = -1 * ts.amount;
                }
            } else {
                totalDeposits += ts.amount;
            }
        }
    }
    let byCategoryPercent = {};
    for (let category of Object.keys(byCategory)) {
        byCategoryPercent[category] = String(((byCategory[category] / totalDeposits) * 100).toFixed(2)) + '%';
    }

    console.log(`no. of transactions: ${acceptedTs.length}\n deposits: ${totalDeposits}, withdrawals: ${totalWithdrawals}`);
    console.log(byCategory);
    console.log(byCategoryPercent);
});