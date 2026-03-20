/**
 * Build Pipeline Step 1: Fetch works from Wikidata SPARQL
 *
 * Strategy: Query by instance-of (P31) which is indexed and fast.
 *   Books: Q7725634 (literary work), Q571 (book), Q8261 (novel), Q49084 (short story collection)
 *   Movies: Q11424 (film), Q24856 (film series)
 *
 * Two-pass: core metadata first, then details in small batches.
 *
 * Usage: node build/fetch-wikidata.js [--min-sitelinks 10] [--batch-size 300]
 */

'use strict';

const db = require('../db');

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const MIN_SITELINKS = parseInt(process.argv.find((a, i) => process.argv[i - 1] === '--min-sitelinks') || '10');
const BATCH_SIZE = parseInt(process.argv.find((a, i) => process.argv[i - 1] === '--batch-size') || '300');
const RATE_LIMIT_MS = 3500;
const MAX_RETRIES = 5;
const USER_AGENT = 'InspireMeBot/2.0 (https://github.com/InspireMe; contact@example.com)';

// Wikidata type classes
const BOOK_CLASSES = ['Q7725634', 'Q571', 'Q8261', 'Q49084', 'Q725377', 'Q12308638'];
const MOVIE_CLASSES = ['Q11424', 'Q24856', 'Q506240', 'Q21191270'];

function buildCoreQuery(type, offset) {
    const classes = type === 'book' ? BOOK_CLASSES : MOVIE_CLASSES;
    const creatorProp = type === 'book' ? 'wdt:P50' : 'wdt:P57';
    const valuesClause = classes.map(c => 'wd:' + c).join(' ');

    return `
SELECT ?item ?itemLabelIt ?itemLabelEn ?creatorLabel ?year ?sitelinks
WHERE {
    VALUES ?class { ${valuesClause} }
    ?item wdt:P31 ?class .
    ?item wikibase:sitelinks ?sitelinks .
    FILTER(?sitelinks >= ${MIN_SITELINKS})

    OPTIONAL { ?item ${creatorProp} ?creator . ?creator rdfs:label ?creatorLabel FILTER(LANG(?creatorLabel) = "en") }
    OPTIONAL { ?item rdfs:label ?itemLabelIt FILTER(LANG(?itemLabelIt) = "it") }
    OPTIONAL { ?item rdfs:label ?itemLabelEn FILTER(LANG(?itemLabelEn) = "en") }
    OPTIONAL { ?item wdt:P577 ?pubDate . BIND(YEAR(?pubDate) AS ?year) }
}
ORDER BY DESC(?sitelinks)
LIMIT ${BATCH_SIZE}
OFFSET ${offset}
    `.trim();
}

function buildDetailQuery(wikidataIds) {
    const values = wikidataIds.map(id => 'wd:' + id).join(' ');
    return `
SELECT ?item ?countryLabel
       (GROUP_CONCAT(DISTINCT ?genreLabel; SEPARATOR="|") AS ?genres)
WHERE {
    VALUES ?item { ${values} }
    OPTIONAL { ?item wdt:P495 ?country . ?country rdfs:label ?countryLabel FILTER(LANG(?countryLabel) = "en") }
    OPTIONAL { ?item wdt:P136 ?genre . ?genre rdfs:label ?genreLabel FILTER(LANG(?genreLabel) = "en") }
}
GROUP BY ?item ?countryLabel
    `.trim();
}

async function sparqlFetch(query, retryCount) {
    retryCount = retryCount || 0;
    const url = SPARQL_ENDPOINT + '?query=' + encodeURIComponent(query) + '&format=json';

    try {
        const res = await fetch(url, {
            headers: { 'Accept': 'application/sparql-results+json', 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(180000)
        });

        if (res.status === 429 || res.status === 503 || res.status === 504) {
            if (retryCount >= MAX_RETRIES) throw new Error('SPARQL ' + res.status + ' after ' + MAX_RETRIES + ' retries');
            var wait = Math.min(5000 * Math.pow(2, retryCount), 120000);
            console.log('  [' + res.status + '] retry ' + (retryCount+1) + '/' + MAX_RETRIES + ' in ' + (wait/1000) + 's...');
            await sleep(wait);
            return sparqlFetch(query, retryCount + 1);
        }

        if (!res.ok) {
            var body = await res.text().catch(function() { return ''; });
            throw new Error('SPARQL ' + res.status + ': ' + body.substring(0, 200));
        }

        var data = await res.json();
        return data.results && data.results.bindings ? data.results.bindings : [];

    } catch (err) {
        if (err.name === 'TimeoutError' || err.name === 'AbortError') {
            if (retryCount >= MAX_RETRIES) throw new Error('Timeout after ' + MAX_RETRIES + ' retries');
            var w = Math.min(10000 * Math.pow(2, retryCount), 120000);
            console.log('  [Timeout] retry ' + (retryCount+1) + '/' + MAX_RETRIES + ' in ' + (w/1000) + 's...');
            await sleep(w);
            return sparqlFetch(query, retryCount + 1);
        }
        throw err;
    }
}

function processRow(row, type) {
    var wid = (row.item && row.item.value ? row.item.value : '').split('/').pop();
    if (!wid) return null;
    var tIt = row.itemLabelIt ? row.itemLabelIt.value : null;
    var tEn = row.itemLabelEn ? row.itemLabelEn.value : null;
    if (!tIt && !tEn) return null;
    var creator = row.creatorLabel ? row.creatorLabel.value : null;
    var year = row.year && row.year.value ? parseInt(row.year.value) : null;
    var sl = parseInt(row.sitelinks ? row.sitelinks.value : '0');
    var np = [tIt, tEn, creator, year].filter(Boolean).length;
    return {
        wikidata_id: wid, type: type,
        title_it: tIt, title_en: tEn, title_orig: null,
        creator: creator, year: year,
        genres: [], country: null,
        sitelinks: sl, popularity: sl * 4 + np * 2, awards: []
    };
}

function applyDetails(worksMap, detailRows) {
    for (var i = 0; i < detailRows.length; i++) {
        var row = detailRows[i];
        var id = (row.item && row.item.value ? row.item.value : '').split('/').pop();
        var work = worksMap[id];
        if (!work) continue;
        if (row.countryLabel && row.countryLabel.value && !work.country) work.country = row.countryLabel.value;
        if (row.genres && row.genres.value) work.genres = row.genres.value.split('|').filter(Boolean).slice(0, 5);
        var np = [work.title_it, work.title_en, work.creator, work.year, work.country].filter(Boolean).length;
        work.popularity = work.sitelinks * 4 + np * 2;
    }
}

async function fetchAll() {
    console.log('Inspire Build - Step 1: Fetch Wikidata');
    console.log('  Min sitelinks: ' + MIN_SITELINKS + '  Batch size: ' + BATCH_SIZE);
    db.getDb();
    var totalInserted = 0;

    var types = ['book', 'movie'];
    for (var t = 0; t < types.length; t++) {
        var type = types[t];
        console.log('\nFetching ' + type + 's...');
        var offset = 0;
        var batchNum = 0;
        var fails = 0;

        while (true) {
            batchNum++;
            console.log('  Batch ' + batchNum + ' (offset ' + offset + ')...');
            var rows;
            try {
                rows = await sparqlFetch(buildCoreQuery(type, offset));
            } catch (err) {
                console.error('  ERROR: ' + err.message);
                offset += BATCH_SIZE;
                fails++;
                if (fails >= 3) { console.log('  3 failures - moving on'); break; }
                await sleep(RATE_LIMIT_MS * 3);
                continue;
            }

            if (rows.length === 0) { console.log('  Done with ' + type + 's'); break; }
            fails = 0;

            var worksMap = {};
            for (var i = 0; i < rows.length; i++) {
                var work = processRow(rows[i], type);
                if (work && !worksMap[work.wikidata_id]) worksMap[work.wikidata_id] = work;
            }

            var ids = Object.keys(worksMap);
            if (ids.length > 0) {
                // Detail queries in sub-batches of 40
                for (var d = 0; d < ids.length; d += 40) {
                    var sub = ids.slice(d, d + 40);
                    try {
                        await sleep(RATE_LIMIT_MS);
                        var dr = await sparqlFetch(buildDetailQuery(sub));
                        applyDetails(worksMap, dr);
                    } catch (err) {
                        console.log('  Detail failed: ' + err.message);
                    }
                }

                var inserted = 0;
                var tx = db.getDb().transaction(function() {
                    var vals = Object.values(worksMap);
                    for (var j = 0; j < vals.length; j++) {
                        try { db.upsertWork(vals[j]); inserted++; } catch(e) {}
                    }
                });
                tx();
                totalInserted += inserted;
                console.log('  -> ' + inserted + ' ' + type + 's (total: ' + totalInserted + ')');
            }

            if (rows.length < BATCH_SIZE) { console.log('  All ' + type + 's fetched'); break; }
            offset += BATCH_SIZE;
            await sleep(RATE_LIMIT_MS);
        }
    }

    console.log('\nDONE! Total works: ' + totalInserted);
    var stats = db.getStats();
    console.log('  Books: ' + stats.books + ' | Movies: ' + stats.movies);
    db.close();
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

if (require.main === module) {
    fetchAll().catch(function(err) {
        console.error('FATAL: ' + err);
        db.close();
        process.exit(1);
    });
}

module.exports = { fetchAll: fetchAll };
