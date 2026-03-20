/**
 * Build Pipeline Step 2: Extract plots from Wikipedia dumps
 *
 * Processes wikiextractor JSON output to extract "Plot"/"Trama" sections.
 * Matches each plot to a Wikidata ID via Wikipedia API.
 *
 * Prerequisites:
 *   1. Download Wikipedia dump:
 *      wget https://dumps.wikimedia.org/enwiki/20260101/enwiki-20260101-pages-articles-multistream.xml.bz2
 *   2. Extract with wikiextractor (preserving sections):
 *      python -m wikiextractor.WikiExtractor dump.xml.bz2 --json --html-safe False --sections -o wiki_out/
 *
 * Usage: node build/extract-wikiplots.js --input ./wiki_out/ --lang en
 *        node build/extract-wikiplots.js --input ./wiki_it_out/ --lang it
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const db = require('../db');

// ─── Configuration ───────────────────────────────────────────────

const args = process.argv.slice(2);
const INPUT_DIR = args.find((a, i) => args[i - 1] === '--input') || './wiki_out';
const LANG = args.find((a, i) => args[i - 1] === '--lang') || 'en';
const SOURCE = `wikiplots_${LANG}`;

// Plot section header patterns by language
const PLOT_HEADERS = {
    en: /^=+\s*(plot|plot summary|synopsis|storyline)\s*=+$/i,
    it: /^=+\s*(trama|contenuto|sinossi|riassunto)\s*=+$/i
};

const headerPattern = PLOT_HEADERS[LANG] || PLOT_HEADERS.en;

// ─── Wikipedia → Wikidata ID mapping ─────────────────────────────

const wdCache = new Map();

/**
 * Look up the Wikidata ID for a Wikipedia page title.
 * Uses Wikipedia API action=query&prop=pageprops.
 */
async function getWikidataId(pageTitle) {
    if (wdCache.has(pageTitle)) return wdCache.get(pageTitle);

    try {
        const url = `https://${LANG}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=pageprops&ppprop=wikibase_item&format=json&origin=*`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'InspireMeBot/2.0' },
            signal: AbortSignal.timeout(10000)
        });
        const data = await res.json();
        const pages = data.query?.pages || {};
        const page = Object.values(pages)[0];
        const wdId = page?.pageprops?.wikibase_item || null;

        wdCache.set(pageTitle, wdId);
        return wdId;
    } catch {
        wdCache.set(pageTitle, null);
        return null;
    }
}

// ─── Extract plots from wikiextractor output ─────────────────────

/**
 * Process a single wikiextractor JSON file.
 * Each line is a JSON object: { id, title, text }
 * where text contains == Section headers ==.
 */
async function processFile(filePath) {
    const results = [];

    const rl = readline.createInterface({
        input: fs.createReadStream(filePath, 'utf8'),
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        if (!line.trim()) continue;

        let article;
        try {
            article = JSON.parse(line);
        } catch {
            continue;
        }

        const { title, text } = article;
        if (!title || !text) continue;

        // Extract plot section
        const plotText = extractPlotSection(text);
        if (plotText && plotText.length >= 50) {
            results.push({
                title: title.trim(),
                plot: plotText.trim()
            });
        }
    }

    return results;
}

/**
 * Extract the content of a Plot/Trama section from article text.
 */
function extractPlotSection(text) {
    const lines = text.split('\n');
    let inPlot = false;
    let plotLines = [];
    let plotLevel = 0;

    for (const line of lines) {
        // Check if this is a section header
        const headerMatch = line.match(/^(=+)\s*(.*?)\s*=+$/);

        if (headerMatch) {
            const level = headerMatch[1].length;
            const title = headerMatch[2];

            if (inPlot) {
                // End of plot section (next header at same or higher level)
                if (level <= plotLevel) break;
                // Sub-section within plot — keep it
            } else if (headerPattern.test(line)) {
                inPlot = true;
                plotLevel = level;
            }
            continue;
        }

        if (inPlot) {
            // Clean HTML tags and references
            const cleaned = line
                .replace(/<[^>]+>/g, '')
                .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2') // [[link|text]] → text
                .replace(/\{\{[^}]+\}\}/g, '')  // {{templates}}
                .replace(/'''?/g, '')            // bold/italic markup
                .replace(/&[a-z]+;/gi, ' ')      // HTML entities
                .trim();

            if (cleaned) plotLines.push(cleaned);
        }
    }

    return plotLines.join(' ').trim();
}

// ─── Walk directory ──────────────────────────────────────────────

function walkDir(dir) {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkDir(fullPath));
        } else if (entry.name.startsWith('wiki_')) {
            files.push(fullPath);
        }
    }
    return files;
}

// ─── Main ────────────────────────────────────────────────────────

async function extractAll() {
    console.log('═══════════════════════════════════════════');
    console.log(' Inspire Build — Step 2: Extract WikiPlots');
    console.log(`  Input: ${INPUT_DIR}`);
    console.log(`  Language: ${LANG}`);
    console.log('═══════════════════════════════════════════\n');

    if (!fs.existsSync(INPUT_DIR)) {
        console.error(`❌ Input directory not found: ${INPUT_DIR}`);
        console.error('   Run wikiextractor first. See README for instructions.');
        process.exit(1);
    }

    db.getDb();

    const files = walkDir(INPUT_DIR);
    console.log(`📂 Found ${files.length} wiki_* files to process\n`);

    let totalPlots = 0;
    let totalMatched = 0;
    let totalInserted = 0;
    let batchForApi = [];
    const BATCH_API_SIZE = 20;
    const API_DELAY_MS = 200;

    for (let fi = 0; fi < files.length; fi++) {
        const file = files[fi];
        const relPath = path.relative(INPUT_DIR, file);

        process.stdout.write(`  [${fi + 1}/${files.length}] ${relPath}...`);
        const plots = await processFile(file);
        totalPlots += plots.length;
        process.stdout.write(` ${plots.length} plots\n`);

        // Match to Wikidata and insert
        for (const { title, plot } of plots) {
            const wikidataId = await getWikidataId(title);

            if (wikidataId) {
                const work = db.getWorkByWikidataId(wikidataId);
                if (work) {
                    try {
                        db.insertPlot({
                            work_id: work.id,
                            source: SOURCE,
                            language: LANG,
                            plot_text: plot,
                            plot_short: plot.substring(0, 500),
                            match_confidence: 1.0  // exact Wikipedia ID match
                        });
                        totalInserted++;
                    } catch {
                        // Duplicate or constraint error
                    }
                    totalMatched++;
                }
            }

            // Rate limit Wikipedia API
            await sleep(API_DELAY_MS);
        }

        // Progress log every 10 files
        if ((fi + 1) % 10 === 0) {
            console.log(`    → Progress: ${totalPlots} plots found, ${totalMatched} matched, ${totalInserted} inserted`);
        }
    }

    console.log(`\n✅ Done!`);
    console.log(`   📝 Total plots extracted: ${totalPlots}`);
    console.log(`   🔗 Matched to Wikidata: ${totalMatched}`);
    console.log(`   💾 Inserted in DB: ${totalInserted}`);
    db.close();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

if (require.main === module) {
    extractAll().catch(err => {
        console.error('❌ Fatal error:', err);
        db.close();
        process.exit(1);
    });
}

module.exports = { extractAll, extractPlotSection };
