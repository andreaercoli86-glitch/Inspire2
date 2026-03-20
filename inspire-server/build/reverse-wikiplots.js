/**
 * Reverse WikiPlots Enrichment
 * 
 * Instead of: WikiPlots title -> find in DB (57% match)
 * We do:      DB work title -> find in WikiPlots titles (should be much higher)
 * 
 * This maximizes coverage of OUR 14,472 works.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const db = require('../db');
const { normalizeTitle, resolveWikipediaTitles } = require('./match-utils');

const TITLES_PATH = path.join(__dirname, '..', 'plots_data', 'wikiplots', 'titles');
const PLOTS_PATH = path.join(__dirname, '..', 'plots_data', 'wikiplots', 'plots');
const SOURCE = 'wikiplots_rev';

async function readLines(filePath) {
    const lines = [];
    const rl = readline.createInterface({ input: fs.createReadStream(filePath, 'utf8'), crlfDelay: Infinity });
    for await (const line of rl) lines.push(line.trim());
    return lines;
}

async function readPlots(filePath) {
    const plots = [];
    let current = [];
    const rl = readline.createInterface({ input: fs.createReadStream(filePath, 'utf8'), crlfDelay: Infinity });
    for await (const line of rl) {
        if (line.trim() === '<EOS>') { plots.push(current.join(' ').trim()); current = []; }
        else current.push(line.trim());
    }
    if (current.length) plots.push(current.join(' ').trim());
    return plots;
}

async function main() {
    console.log('=== Reverse WikiPlots Enrichment ===\n');

    db.getDb();

    // Step 1: Build WikiPlots index (title -> plot index)
    console.log('Loading WikiPlots titles...');
    const wpTitles = await readLines(TITLES_PATH);
    console.log(`  ${wpTitles.length} titles loaded`);

    // Build normalized title -> index map (for fast lookup)
    const wpNormIndex = new Map();  // normalized title -> [indices]
    const wpExactIndex = new Map(); // exact title -> index
    for (let i = 0; i < wpTitles.length; i++) {
        const exact = wpTitles[i];
        wpExactIndex.set(exact, i);
        const norm = normalizeTitle(exact);
        if (!norm) continue;
        if (!wpNormIndex.has(norm)) wpNormIndex.set(norm, []);
        wpNormIndex.get(norm).push(i);
    }
    console.log(`  ${wpNormIndex.size} unique normalized titles indexed\n`);

    // Step 2: Get DB works that don't have a plot yet
    const d = db.getDb();
    const worksWithoutPlot = d.prepare(`
        SELECT w.id, w.wikidata_id, w.title_en, w.title_it, w.title_orig, w.year, w.type
        FROM works w
        LEFT JOIN plots p ON p.work_id = w.id
        WHERE p.id IS NULL
        ORDER BY w.popularity DESC
    `).all();
    console.log(`Works without plots: ${worksWithoutPlot.length} / ${d.prepare('SELECT COUNT(*) as c FROM works').get().c}\n`);

    // Step 3: For each work, try to find its plot in WikiPlots
    let matchedExact = 0, matchedNorm = 0, matchedFuzzy = 0, noMatch = 0;
    let inserted = 0, duplicates = 0;
    const plotsToLoad = []; // [{ workId, plotIndex }]

    for (const work of worksWithoutPlot) {
        const titlesToTry = [work.title_en, work.title_it, work.title_orig].filter(Boolean);
        let foundIdx = -1;
        let matchType = '';

        // Try 1: Exact match with WikiPlots title
        for (const t of titlesToTry) {
            if (wpExactIndex.has(t)) { foundIdx = wpExactIndex.get(t); matchType = 'exact'; break; }
            // Try with year suffix: "Title (YEAR film)"
            if (work.year && work.type === 'movie') {
                const withYear = `${t} (${work.year} film)`;
                if (wpExactIndex.has(withYear)) { foundIdx = wpExactIndex.get(withYear); matchType = 'exact_year'; break; }
            }
            if (work.year && work.type === 'book') {
                const withYear = `${t} (novel)`;
                if (wpExactIndex.has(withYear)) { foundIdx = wpExactIndex.get(withYear); matchType = 'exact_novel'; break; }
            }
        }

        // Try 2: Normalized title match
        if (foundIdx === -1) {
            for (const t of titlesToTry) {
                const norm = normalizeTitle(t);
                if (!norm) continue;
                const candidates = wpNormIndex.get(norm);
                if (candidates && candidates.length > 0) {
                    // If multiple, prefer the one without disambiguation
                    foundIdx = candidates[0];
                    matchType = 'normalized';
                    break;
                }
            }
        }

        if (foundIdx >= 0) {
            plotsToLoad.push({ workId: work.id, plotIndex: foundIdx, matchType });
            if (matchType.startsWith('exact')) matchedExact++;
            else matchedNorm++;
        } else {
            noMatch++;
        }
    }

    console.log(`Matching results:`);
    console.log(`  Exact/year match: ${matchedExact}`);
    console.log(`  Normalized match: ${matchedNorm}`);
    console.log(`  No match: ${noMatch}`);
    console.log(`  Total to insert: ${plotsToLoad.length}\n`);

    if (plotsToLoad.length === 0) {
        console.log('Nothing to insert!');
        db.close();
        return;
    }

    // Step 4: Load plots for matched works and insert
    console.log('Loading plots file (this may take a moment)...');
    const allPlots = await readPlots(PLOTS_PATH);
    console.log(`  ${allPlots.length} plots loaded\n`);

    console.log('Inserting plots...');
    const BATCH = 500;
    for (let i = 0; i < plotsToLoad.length; i += BATCH) {
        const batch = plotsToLoad.slice(i, i + BATCH);
        const tx = d.transaction(() => {
            for (const { workId, plotIndex, matchType } of batch) {
                const plotText = allPlots[plotIndex];
                if (!plotText || plotText.length < 50) continue;
                const confidence = matchType.startsWith('exact') ? 0.90 : 0.65;
                try {
                    db.insertPlot({
                        work_id: workId,
                        source: SOURCE,
                        language: 'en',
                        plot_text: plotText,
                        plot_short: plotText.substring(0, 500),
                        match_confidence: confidence
                    });
                    inserted++;
                } catch (e) { duplicates++; }
            }
        });
        tx();
        const pct = Math.round(((i + batch.length) / plotsToLoad.length) * 100);
        process.stdout.write(`\r  [${pct}%] ${inserted} inserted, ${duplicates} duplicates`);
    }

    // Stats
    const totalWorks = d.prepare('SELECT COUNT(*) as c FROM works').get().c;
    const worksWithPlots = d.prepare('SELECT COUNT(DISTINCT work_id) as c FROM plots').get().c;
    const coverage = (worksWithPlots / totalWorks * 100).toFixed(1);

    console.log(`\n\nDONE!`);
    console.log(`  Inserted: ${inserted}`);
    console.log(`  Duplicates: ${duplicates}`);
    console.log(`  DB coverage: ${worksWithPlots}/${totalWorks} works have plots (${coverage}%)`);
    db.close();
}

if (require.main === module) {
    main().catch(err => { console.error('FATAL:', err); db.close(); process.exit(1); });
}
