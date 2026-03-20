/**
 * Fetch Wikipedia summaries for works missing plots.
 * Uses Wikipedia REST API /page/summary endpoint.
 * This gets the lead section extract (first paragraph).
 */
'use strict';
const db = require('../db');
const SOURCE = 'wikipedia_api';
const RATE_LIMIT_MS = 100;

async function fetchSummary(title) {
    const encoded = encodeURIComponent(title.replace(/ /g, '_'));
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'InspireMeBot/2.0', 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000)
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.type === 'disambiguation') return null;
        const extract = data.extract;
        if (!extract || extract.length < 50) return null;
        return { extract, wikidata_id: data.wikibase_item || null };
    } catch { return null; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    console.log('=== Wikipedia Summary Enrichment ===\n');
    db.getDb();
    const d = db.getDb();

    const missing = d.prepare(`
        SELECT w.id, w.wikidata_id, w.title_en, w.title_it, w.title_orig, w.type, w.year, w.sitelinks
        FROM works w
        LEFT JOIN plots p ON p.work_id = w.id
        WHERE p.id IS NULL
        ORDER BY w.sitelinks DESC
    `).all();
    console.log(`Works without plots: ${missing.length}\n`);

    let fetched = 0, inserted = 0, noResult = 0, errors = 0;

    for (let i = 0; i < missing.length; i++) {
        const work = missing[i];
        const title = work.title_en || work.title_it || work.title_orig;
        if (!title) { noResult++; continue; }

        const result = await fetchSummary(title);
        if (result && result.extract) {
            try {
                db.insertPlot({
                    work_id: work.id,
                    source: SOURCE,
                    language: 'en',
                    plot_text: result.extract,
                    plot_short: result.extract.substring(0, 500),
                    match_confidence: 0.80
                });
                inserted++;
            } catch (e) { errors++; }
            fetched++;
        } else {
            // Try Italian title as fallback on Italian Wikipedia
            if (work.title_it && work.title_it !== title) {
                const itEncoded = encodeURIComponent(work.title_it.replace(/ /g, '_'));
                const itUrl = `https://it.wikipedia.org/api/rest_v1/page/summary/${itEncoded}`;
                try {
                    const res = await fetch(itUrl, {
                        headers: { 'User-Agent': 'InspireMeBot/2.0', 'Accept': 'application/json' },
                        signal: AbortSignal.timeout(10000)
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.extract && data.extract.length >= 50 && data.type !== 'disambiguation') {
                            db.insertPlot({
                                work_id: work.id,
                                source: SOURCE + '_it',
                                language: 'it',
                                plot_text: data.extract,
                                plot_short: data.extract.substring(0, 500),
                                match_confidence: 0.80
                            });
                            inserted++;
                            fetched++;
                        } else { noResult++; }
                    } else { noResult++; }
                } catch { noResult++; }
            } else { noResult++; }
        }

        if ((i + 1) % 100 === 0 || i === missing.length - 1) {
            const pct = Math.round((i + 1) / missing.length * 100);
            const totalWorks = d.prepare('SELECT COUNT(*) as c FROM works').get().c;
            const withPlots = d.prepare('SELECT COUNT(DISTINCT work_id) as c FROM plots').get().c;
            const coverage = (withPlots / totalWorks * 100).toFixed(1);
            console.log(`  [${pct}%] ${i+1}/${missing.length} checked | inserted: ${inserted} | coverage: ${withPlots}/${totalWorks} (${coverage}%)`);
        }

        await sleep(RATE_LIMIT_MS);
    }

    const totalWorks = d.prepare('SELECT COUNT(*) as c FROM works').get().c;
    const withPlots = d.prepare('SELECT COUNT(DISTINCT work_id) as c FROM plots').get().c;
    const coverage = (withPlots / totalWorks * 100).toFixed(1);

    console.log(`\nDONE!`);
    console.log(`  Fetched: ${fetched}`);
    console.log(`  Inserted: ${inserted}`);
    console.log(`  No result: ${noResult}`);
    console.log(`  Errors: ${errors}`);
    console.log(`  FINAL COVERAGE: ${withPlots}/${totalWorks} (${coverage}%)`);
    db.close();
}

if (require.main === module) {
    main().catch(err => { console.error('FATAL:', err); db.close(); process.exit(1); });
}

