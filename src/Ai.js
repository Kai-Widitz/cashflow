import { CATEGORIES } from '../private/categories.js';
import { CATEGORY_KEYWORDS } from '../private/keywords.js';

const OLLAMA_URL = 'http://localhost:11434/api/chat';
const MODEL = 'llama3';
const BATCH_SIZE = 20;

const KEYWORD_HINTS = Object.entries(CATEGORY_KEYWORDS)
    .map(([cat, keywords]) => `${cat}: ${keywords.join(', ')}`)
    .join('\n');

function matchKeywordCategory(description) {
    const upper = description.toUpperCase();
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        for (const keyword of keywords) {
            if (upper.includes(keyword.toUpperCase())) {
                return category;
            }
        }
    }
    return null;
}

export async function categorizeBatch(descriptions) {
    const results = new Array(descriptions.length).fill(null);
    const unmatchedIndices = [];
    const unmatchedDescriptions = [];

    descriptions.forEach((description, i) => {
        const category = matchKeywordCategory(description);
        if (category) {
            results[i] = category;
        } else {
            unmatchedIndices.push(i);
            unmatchedDescriptions.push(description);
        }
    });

    console.log(`${descriptions.length - unmatchedDescriptions.length}/${descriptions.length} matched by keyword rules, ${unmatchedDescriptions.length} sent to LLM`);

    if (unmatchedDescriptions.length > 0) {
        const llmResults = await categorizeWithLLM(unmatchedDescriptions);
        unmatchedIndices.forEach((originalIndex, j) => {
            results[originalIndex] = llmResults[j];
        });
    }

    return results;
}

async function categorizeWithLLM(descriptions) {
    const results = [];

    for (let i = 0; i < descriptions.length; i += BATCH_SIZE) {
        const chunk = descriptions.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(descriptions.length / BATCH_SIZE);

        console.log(`Categorizing batch ${batchNum}/${totalBatches} (${chunk.length} transactions)...`);

        const prompt = `You are a financial transaction categorizer.
Categorize each transaction description into exactly one of these mutually exclusive categories:
${CATEGORIES.join(', ')}

Use these keywords as hints when matching categories:
${KEYWORD_HINTS}

Note: DELIVERED_FOOD is for delivery services (e.g. Uber Eats), FOOD is for in-person dining.
If none fit, use "unknown".

IMPORTANT: Respond with ONLY a valid JSON array of quoted strings, no explanation, no preamble, no markdown.
Your entire response must start with [ and end with ]
Every item must be a quoted string e.g. ["GROCERIES", "FUEL"]
You MUST return exactly ${chunk.length} items in the array, one per description.

Descriptions:
${chunk.map((d, j) => `${j + 1}. ${d}`).join('\n')}`;

        const response = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL,
                messages: [{ role: 'user', content: prompt }],
                stream: false
            }),
            signal: AbortSignal.timeout(120000)
        });

        const data = await response.json();
        const raw = data.message.content.trim();

        const match = raw.match(/\[[\s\S]*\]/);
        if (!match) {
            throw new Error(`No JSON array found in batch ${batchNum}: ${raw}`);
        }

        // fix unquoted strings, double quotes and trailing commas in case model misbehaves
        const fixed = match[0]
            .replace(/([A-Z_]+)(?=[,\]\s])/g, '"$1"')
            .replace(/""/g, '"')
            .replace(/,\s*\]/g, ']');

        const result = JSON.parse(fixed);

        if (!Array.isArray(result)) {
            throw new Error(`Response was not an array in batch ${batchNum}: ${raw}`);
        }

        if (result.length !== chunk.length) {
            console.warn(`Warning: batch ${batchNum} returned ${result.length} categories for ${chunk.length} transactions, padding with "unknown"`);
            while (result.length < chunk.length) result.push('unknown');
        }

        results.push(...result);
        console.log(`Batch ${batchNum}/${totalBatches} done.`);
    }

    return results;
}