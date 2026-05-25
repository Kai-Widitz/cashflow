import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Classes
class Transaction {
  constructor(date, description, amount, type) {
    this.date = date;
    this.description = description;
    this.amount = amount;
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
    for (let item of textContent.items) {
      if (item.str.trim() === '') continue;

      if (lastY !== undefined && item.transform[5] !== lastY) {
        if (line.length > 0 && line != "blank") {
            lines.push(line);
        }
        line = [];
      }
      line.push(item.str.trim());
      lastY = item.transform[5];
    }
    if (line.length > 0) lines.push(line);
  }
  return lines;
}

function extractTransactions(lines) {
    const accepted = []
    const rejected = []
    const unknown = []
    const year = new Date().getFullYear();
    for (let line of lines) {
        if (line.length == 3) {
            let dateStr = line[0];
            const descStr = line[1];
            const amountStr = line[2];
            
            const dateFinal = parseDayMoStr(dateStr, year)
            if (dateFinal == null) {
                rejected.push(line);
                continue;
            }
            // TODO process desc (to determine if its withdrawl or deposit) and amount



        } else {
            rejected.push(line);
        }
    }
}

function parseDayMoStr(dateStr, year) {
    const regex = /^(\d{1,2})\s([A-Z]{3})$/;
    let dateStr = str.trim().match(dateStr);
    if (!dateStr) {
        return null;
    }
    const [, day, month] = match;
    const date = new Date(`${day} ${month} ${year}`);
    if (isNaN(date.getTime())) {
        return null;
    }
    return date
}

// test
const lines = extractLines('uploads/test.pdf').then((lines) => {extractTransactions(lines)})

