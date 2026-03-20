/**
 * Build Pipeline Step 2b: Import WikiPlots dataset
 * Uses multi-tier matching (Tier 2: Wikipedia API -> QID)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const db = require('../db');
const { multiTierMatch, buildWorksIndex } = require('./match-utils');

const args = process.argv.slice(2);
const TITLES_PATH = args.find((a, i) => args[i - 1] === '--titles') ||
    path.join(__dirname, '..', 'plots_data', 'wikiplots', 'titles');
const PLOTS_PATH = args.find((a, i) => args[i - 1] === '--plots') ||
    path.join(__dirname, '..', 'plots_data', 'wikiplots', 'plots');
const SOURCE = 'wikiplots';
const BATCH_SIZE = 200;

async function parseTitlesFile(filePath) {
    const titles = [];
    const rl = readline.createInterface({ input: fs.createReadStream(filePath, 'utf8'), crlfDelay: Infinity });
    for await (const line of rl) { titles.push(line.trim()); }
    return titles;
}

async function parsePlotsFile(filePath) {
    const plots = [];
    let currentPlot = [];
    const rl = readline.createInterface({ input: fs.createReadStream(filePath, 'utf8'), crlfDelay: Infinity });
    for await (const line of rl) {
        if (line.trim() === '<EOS>') { plots.push(currentPlot.join(' ').trim()); currentPlot = []; }
        else { currentPlot.push(line.trim()); }
    }
    if (currentPlot.length > 0) plots.push(currentPlot.join(' ').trim());
    return plots;
}

function extractYearFromTitle(title) {
    const m = title.match(/\((\d{4})(?:\s+(?:film|movie|novel|book|TV|series))?\)/);
    return m ? parseInt(m[1]) : null;
}

async function importAll() {
    console.log('=== Inspire Build - Import WikiPlots ===');
    console.log(`  Titles: ${TITLES_PATH}`);
    console.log(`  Plots:  ${PLOTS_PATH}\n`);

    if (!fs.existsSync(TITLES_PATH) || !fs.existsSync(PLOTS_PATH)) {
        console.error('ERROR: WikiPlots files not found.'); process.exit(1);
    }

    console.log('Parsing titles...');
    const titles = await parseTitlesFile(TITLES_PATH);
    console.log(`  -> ${titles.length} titles`);

    console.log('Parsing plots...');
    const plots = await parsePlotsFile(PLOTS_PATH);
    console.log(`  -> ${plots.length} plots`);

    const minLen = Math.min(titles.length, plots.length);
    if (titles.length !== plots.length) {
        console.log(`  WARNING: mismatch ${titles.length} titles vs ${plots.length} plots, using ${minLen}`);
    }

    const entries = [];
    for (let i = 0; i < minLen; i++) {
        const plotText = plots[i];
        if (!plotText || plotText.length < 50) continue;
        entries.push({
            title: titles[i],
            wikipedia_title: titles[i],
            year: extractYearFromTitle(titles[i]),
            plot_text: plotText
        });
    }
    console.log(`\n${entries.length} entries with valid plots (>=50 chars)\n`);

    db.getDb();
    console.log('Building works index...');
    const worksIndex = buildWorksIndex(db);
    console.log(`  -> ${worksIndex.length} works in index\n`);

    let totalInserted = 0, totalMatched = 0;
    let tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    let duplicates = 0;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(entries.length / BATCH_SIZE);
        console.log(`\n-- Batch ${batchNum}/${totalBatches} (${batch.length} entries) --`);

        const { matched } = await multiTierMatch({
            entries: batch, db, worksIndex, useWikipediaApi: true, source: SOURCE
        });
        totalMatched += matched.length;

        const tx = db.getDb().transaction(() => {
            for (const { entry, work_id, confidence, tier } of matched) {
                try {
                    db.insertPlot({
                        work_id, source: SOURCE, language: 'en',
                        plot_text: entry.plot_text,
                        plot_short: entry.plot_text.substring(0, 500),
                        match_confidence: confidence
                    });
                    totalInserted++;
                    tierCounts[tier]++;
                } catch (err) { duplicates++; }
            }
        });
        tx();

        const pct = Math.round(((i + batch.length) / entries.length) * 100);
        console.log(`  [${pct}%] Running: ${totalMatched} matched, ${totalInserted} inserted`);
    }

    console.log(`\nDONE! WikiPlots import complete`);
    console.log(`  Total entries: ${entries.length}`);
    console.log(`  Matched: ${totalMatched}`);
    console.log(`  Inserted: ${totalInserted}`);
    console.log(`  Duplicates: ${duplicates}`);
    console.log(`  By tier:`);
    console.log(`    Tier 2 (Wikipedia API): ${tierCounts[2]}`);
    console.log(`    Tier 3 (Fuzzy match):   ${tierCounts[3]}`);
    console.log(`    Tier 4 (Normalized):    ${tierCounts[4]}`);
    db.close();
}

if (require.main === module) {
    importAll().catch(err => { console.error('FATAL:', err); db.close(); process.exit(1); });
}
module.exports = { importAll };
