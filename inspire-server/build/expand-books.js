'use strict';
const db = require('../db');
const SPARQL = 'https://query.wikidata.org/sparql';
const UA = 'InspireMeBot/2.0';
const DELAY = 2500;
const RETRIES = 5;
const BATCH = 300;

// All book-like classes (direct P31)
const CLASSES = [
    'Q7725634','Q571','Q8261','Q49084','Q725377','Q12308638',
    'Q5185279','Q1667921','Q747381','Q25379','Q35760',
    'Q179461','Q116476516','Q21198342','Q1004','Q867335',
    'Q12765855','Q20540385','Q37484','Q1279564','Q192782',
    'Q384515','Q23622'
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function query(sparql, retry = 0) {
    const url = `${SPARQL}?query=${encodeURIComponent(sparql)}&format=json`;
    try {
        const r = await fetch(url, {
            headers: { 'Accept': 'application/sparql-results+json', 'User-Agent': UA },
            signal: AbortSignal.timeout(120000)
        });
        if ([429, 503, 504].includes(r.status)) {
            if (retry >= RETRIES) throw new Error(`${r.status} after ${RETRIES} retries`);
            const w = Math.min(5000 * (2 ** retry), 120000);
            console.log(`    retry ${retry+1} in ${(w/1000)|0}s (${r.status})...`);
            await sleep(w);
            return query(sparql, retry + 1);
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()).results?.bindings || [];
    } catch (e) {
        if (e.name === 'TimeoutError' && retry < RETRIES) {
            const w = Math.min(10000 * (2 ** retry), 120000);
            console.log(`    timeout retry ${retry+1} in ${(w/1000)|0}s...`);
            await sleep(w);
            return query(sparql, retry + 1);
        }
        throw e;
    }
}

// PASS 1: lightweight core query (no ORDER BY, minimal OPTIONAL)
function coreQuery(cls, offset) {
    return `SELECT DISTINCT ?item ?labelEn ?labelIt ?sl WHERE {
  ?item wdt:P31 wd:${cls} .
  ?item wikibase:sitelinks ?sl . FILTER(?sl >= 5)
  FILTER NOT EXISTS { ?item wdt:P31 wd:Q5 }
  FILTER NOT EXISTS { ?item wdt:P31 wd:Q4167410 }
  OPTIONAL { ?item rdfs:label ?labelEn FILTER(LANG(?labelEn)="en") }
  OPTIONAL { ?item rdfs:label ?labelIt FILTER(LANG(?labelIt)="it") }
} LIMIT ${BATCH} OFFSET ${offset}`;
}

// PASS 2: detail query for a sub-batch of IDs
function detailQuery(ids) {
    const vals = ids.map(i => `wd:${i}`).join(' ');
    return `SELECT ?item ?origTitle ?creatorEn ?creatorIt ?year ?countryEn
  (GROUP_CONCAT(DISTINCT ?genreEn;SEPARATOR="|") AS ?genres) WHERE {
  VALUES ?item { ${vals} }
  OPTIONAL { ?item wdt:P1476 ?origTitle }
  OPTIONAL { ?item wdt:P50 ?cr . ?cr rdfs:label ?creatorEn FILTER(LANG(?creatorEn)="en") }
  OPTIONAL { ?item wdt:P50 ?cr2 . ?cr2 rdfs:label ?creatorIt FILTER(LANG(?creatorIt)="it") }
  OPTIONAL { ?item wdt:P577 ?pd . BIND(YEAR(?pd) AS ?year) }
  OPTIONAL { ?item wdt:P495 ?co . ?co rdfs:label ?countryEn FILTER(LANG(?countryEn)="en") }
  OPTIONAL { ?item wdt:P136 ?ge . ?ge rdfs:label ?genreEn FILTER(LANG(?genreEn)="en") }
} GROUP BY ?item ?origTitle ?creatorEn ?creatorIt ?year ?countryEn`;
}

async function main() {
    console.log('=== Expand Books (lightweight 2-pass) ===');
    db.getDb();
    const start = db.getWorkCount('book');
    console.log(`Starting books: ${start}\n`);

    let grandTotal = 0;

    for (const cls of CLASSES) {
        let offset = 0, clsTotal = 0, fails = 0;
        process.stdout.write(`${cls}: `);

        while (true) {
            let rows;
            try { rows = await query(coreQuery(cls, offset)); }
            catch (e) { console.log(`ERR(${e.message})`); fails++; if (fails >= 3) break; offset += BATCH; await sleep(DELAY*2); continue; }
            
            if (!rows.length) break;
            fails = 0;

            // Build map from core results
            const map = {};
            for (const r of rows) {
                const qid = (r.item?.value || '').split('/').pop();
                const en = r.labelEn?.value || null;
                const it = r.labelIt?.value || null;
                if (!qid || (!en && !it)) continue;
                const sl = parseInt(r.sl?.value || '0');
                map[qid] = { wikidata_id: qid, type: 'book', title_en: en, title_it: it,
                    title_orig: null, creator: null, year: null, genres: [], country: null,
                    sitelinks: sl, popularity: sl * 4, awards: [] };
            }

            // Detail queries in sub-batches of 40
            const ids = Object.keys(map);
            for (let i = 0; i < ids.length; i += 40) {
                try {
                    await sleep(DELAY);
                    const det = await query(detailQuery(ids.slice(i, i + 40)));
                    for (const r of det) {
                        const id = (r.item?.value || '').split('/').pop();
                        const w = map[id]; if (!w) continue;
                        w.title_orig = r.origTitle?.value || null;
                        w.creator = r.creatorIt?.value || r.creatorEn?.value || null;
                        w.year = r.year?.value ? parseInt(r.year.value) : null;
                        w.country = r.countryEn?.value || null;
                        w.genres = (r.genres?.value || '').split('|').filter(Boolean).slice(0, 5);
                        const np = [w.title_en, w.title_it, w.creator, w.year].filter(Boolean).length;
                        w.popularity = w.sitelinks * 4 + np * 2;
                    }
                } catch (e) { /* skip detail errors */ }
            }

            // Upsert
            let ins = 0;
            const tx = db.getDb().transaction(() => {
                for (const w of Object.values(map)) { try { db.upsertWork(w); ins++; } catch {} }
            });
            tx();
            clsTotal += ins;
            process.stdout.write(`${ins} `);

            if (rows.length < BATCH) break;
            offset += BATCH;
            await sleep(DELAY);
        }

        grandTotal += clsTotal;
        console.log(`| class total: ${clsTotal} | DB books: ${db.getWorkCount('book')}`);
    }

    const final = db.getWorkCount('book');
    const total = db.getWorkCount();
    console.log(`\nDONE!`);
    console.log(`  Books: ${start} -> ${final} (+${final - start})`);
    console.log(`  Total works: ${total}`);
    db.close();
}

if (require.main === module) {
    main().catch(e => { console.error('FATAL:', e); db.close(); process.exit(1); });
}
