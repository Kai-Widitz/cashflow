import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
//Constants
const PDF_X_LOWER_LIMIT_DEPOSITS = 500;
const PDF_Y_DELTA_LINE_LIMIT = 15;
// Classes
class Transaction {
  constructor(date, description, amount, category) {
    this.date = date;
    this.description = description;
    this.amount = amount;
    this.category = category
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
        lastX = item.transform[4]
        
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

function getCategoryFromDesc(desc) {
    return "unknown"
}

function extractTransactions(lines) {
    const accepted = [];
    const rejected = [];
    const year = new Date().getFullYear();
    for (let lineData of lines) {
        const [line, transactionType] = lineData; 
        if (line.length == 3) {
            let dateStr = line[0];
            const descStr = line[1];
            let amountStr = line[2];
            
            const dateFinal = parseDayMoStr(dateStr, year);
            if (dateFinal == null) {
                rejected.push(line);
                continue;
            }

            if (amountStr.length < 2) {
                rejected.push(line);
                continue;
            }
            amountStr = amountStr.slice(1).replace(/,/g, '');
            const isOnlyDigits = (str) => /^\d+(\.\d+)?$/.test(str);
        
            if (!isOnlyDigits(amountStr)) {
                rejected.push(line);
                continue;
            }
            let amountFinal = Number(amountStr);

            if (transactionType == "withdrawal") {
                amountFinal *= -1;
            }

            const category = getCategoryFromDesc(descStr);
            const newTransaction = new Transaction(dateFinal, descStr, amountFinal, category);
            accepted.push(newTransaction);
        }
    }
    return [accepted, rejected]
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
    return date
}

// test
const lines = extractLines('uploads/test.pdf').then((lines) => {
    let acceptedTrans = extractTransactions(lines)[0];
    let totalDeposits = 0
    let totalWithdrawals = 0
    for (let transaction of acceptedTrans) {
        if (transaction.amount < 0) {
            totalWithdrawals -= transaction.amount
        } else {
            totalDeposits += transaction.amount
        }
    }
    console.log(`no. of transactions: ${acceptedTrans.length}\n deposits: ${totalDeposits}, withdrawals: ${totalWithdrawals}`)
})

