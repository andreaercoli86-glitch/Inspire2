/**
 * Build Pipeline Step 3: Import Tell Me Again! dataset (2024)
 *
 * Tell Me Again! provides ~96,831 plot summaries for ~29,505 stories
 * across 5 languages, with Wikidata IDs for direct matching.
 *
 * Dataset: Hatzel et al., LREC 2024
 * Format expected: JSON lines or CSV with fields:
 *   wikidata_id, title, language, plot_text
 *
 * Usage: node build/import-tellmeagain.js --input ./tellmeagain_data/
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const db = require('../db');

// ─── Configuration ───────────────────────────────────────────────

const args = process.argv.slice(2);
const INPUT_PATH = args.find((a, i) => args[i - 1] === '--input') || './tellmeagain_data';
const SOURCE = 'tellmeagain';

// ─── Process JSONL file ──────────────────────────────────────────

async function processJsonl(filePath) {
    const results = [];

    const rl = readline.createInterface({
        input: fs.createReadStream(filePath, 'utf8'),
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        if (!line.trim()) continue;
        try {
            const entry = JSON.parse(line);
            if (entry.wikidata_id && entry.plot_text && entry.language) {
                results.push({
                    wikidata_id: entry.wikidata_id,
                    title: entry.title || '',
                    language: entry.language,
                    plot_text: entry.plot_text,
                    // Some entries may have quality metrics
                    quality: entry.quality || entry.score || 1.0
                });
            }
        } catch {
            continue;
        }
    }

    return results;
}

// ─── Process CSV file ────────────────────────────────────────────

async function processCsv(filePath) {
    const results = [];

    const rl = readline.createInterface({
        input: fs.createReadStream(filePath, 'utf8'),
        crlfDelay: Infinity
    });

    let headers = null;
    for await (const line of rl) {
        if (!line.trim()) continue;

        if (!headers) {
            headers = line.split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
            continue;
        }

        // Simple CSV parse (handles quoted fields)
        const fields = parseCSVLine(line);
        const row = {};
        headers.forEach((h, i) => { row[h] = fields[i] || ''; });

        const wdId = row.wikidata_id || row.qid || row.item || '';
        const plotText = row.plot_text || row.plot || row.summary || row.text || '';
        const lang = row.language || row.lang || 'en';

        if (wdId && plotText.length >= 50) {
            results.push({
                wikidata_id: wdId.startsWith('Q') ? wdId : `Q${wdId}`,
                title: row.title || '',
                language: lang,
                plot_text: plotText,
                quality: parseFloat(row.quality || row.score || '1.0') || 1.0
            });
        }
    }

    return results;
}

function parseCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            fields.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    fields.push(current.trim());
    return fields;
}

// ─── Main ────────────────────────────────────────────────────────

async function importAll() {
    console.log('═══════════════════════════════════════════');
    console.log(' Inspire Build — Step 3: Import Tell Me Again!');
    console.log(`  Input: ${INPUT_PATH}`);
    console.log('═══════════════════════════════════════════\n');

    if (!fs.existsSync(INPUT_PATH)) {
        console.error(`❌ Input not found: ${INPUT_PATH}`);
        console.error('   Download the Tell Me Again! dataset first.');
        console.error('   Paper: https://aclanthology.org/2024.lrec-main.1366/');
        process.exit(1);
    }

    db.getDb();

    // Find all data files
    const stat = fs.statSync(INPUT_PATH);
    let files = [];

    if (stat.isDirectory()) {
        files = fs.readdirSync(INPUT_PATH)
            .filter(f => f.endsWith('.jsonl') || f.endsWith('.json') || f.endsWith('.csv') || f.endsWith('.tsv'))
            .map(f => path.join(INPUT_PATH, f));
    } else {
        files = [INPUT_PATH];
    }

    console.log(`📂 Found ${files.length} data file(s)\n`);

    let totalEntries = 0;
    let totalMatched = 0;
    let totalInserted = 0;
    let langCounts = {};

    for (const file of files) {
        console.log(`  Processing: ${path.basename(file)}`);

        let entries;
        if (file.endsWith('.csv') || file.endsWith('.tsv')) {
            entries = await processCsv(file);
        } else {
            entries = await processJsonl(file);
        }

        totalEntries += entries.length;
        console.log(`    → ${entries.length} entries parsed`);

        // Batch insert
        const tx = db.getDb().transaction(() => {
            for (const entry of entries) {
                const work = db.getWorkByWikidataId(entry.wikidata_id);
                if (!work) continue;

                totalMatched++;

                try {
                    db.insertPlot({
                        work_id: work.id,
                        source: SOURCE,
                        language: entry.language,
                        plot_text: entry.plot_text,
                        plot_short: entry.plot_text.substring(0, 500),
                        match_confidence: 1.0  // TMA has Wikidata IDs = exact match
                    });
                    totalInserted++;
                    langCounts[entry.language] = (langCounts[entry.language] || 0) + 1;
                } catch {
                    // Duplicate — skip
                }
            }
        });
        tx();

        console.log(`    → ${totalMatched} matched, ${totalInserted} inserted`);
    }

    console.log(`\n✅ Done!`);
    console.log(`   📝 Total entries parsed: ${totalEntries}`);
    console.log(`   🔗 Matched to works: ${totalMatched}`);
    console.log(`   💾 Inserted in DB: ${totalInserted}`);
    console.log(`   🌐 By language:`, langCounts);
    db.close();
}

if (require.main === module) {
    importAll().catch(err => {
        console.error('❌ Fatal error:', err);
        db.close();
        process.exit(1);
    });
}

module.exports = { importAll };
