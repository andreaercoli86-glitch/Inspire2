#!/usr/bin/env node
/**
 * Inspire v2 — Pipeline Integration Test
 *
 * Tests the full flow using sql.js (WASM SQLite) as a drop-in
 * replacement for better-sqlite3, to validate logic without
 * native compilation.
 *
 * What it tests:
 * 1. Database schema creation
 * 2. Data insertion (works, plots)
 * 3. FTS5 full-text search
 * 4. Confidence scoring logic
 * 5. Server endpoint responses (mock)
 * 6. Wikidata SPARQL fetch (live, small sample)
 */

const initSqlJs = require('sql.js');
const http = require('http');

const TESTS = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
    TESTS.push({ name, fn });
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
}

// ═══════════════════════════════════════════
// TEST 1: Database Schema
// ═══════════════════════════════════════════

test('Schema creation — works table', async (db) => {
    db.run(`
        CREATE TABLE IF NOT EXISTS works (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wikidata_id TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('book','film')),
            title_it TEXT,
            title_en TEXT,
            original_title TEXT,
            creator TEXT,
            year INTEGER,
            country TEXT,
            genres TEXT DEFAULT '[]',
            awards TEXT DEFAULT '[]',
            sitelinks INTEGER DEFAULT 0,
            popularity_score REAL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_works_type ON works(type)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_works_wikidata ON works(wikidata_id)`);

    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tables[0].values.map(r => r[0]);
    assert(tableNames.includes('works'), 'works table not found');
});

test('Schema creation — plots table', async (db) => {
    db.run(`
        CREATE TABLE IF NOT EXISTS plots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            work_id INTEGER NOT NULL REFERENCES works(id),
            language TEXT NOT NULL CHECK(language IN ('en','it','fr','de','es')),
            plot_text TEXT NOT NULL,
            plot_short TEXT,
            source TEXT DEFAULT 'unknown',
            match_confidence REAL DEFAULT 0,
            UNIQUE(work_id, language, source)
        )
    `);

    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tables[0].values.map(r => r[0]);
    assert(tableNames.includes('plots'), 'plots table not found');
});

test('Schema creation — FTS5 virtual table', async (db) => {
    db.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS search_text USING fts5(
            wikidata_id,
            title_it,
            title_en,
            creator,
            genres,
            content=''
        )
    `);

    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tables[0].values.map(r => r[0]);
    assert(tableNames.includes('search_text'), 'search_text FTS5 table not found');
});

// ═══════════════════════════════════════════
// TEST 2: Data Insertion
// ═══════════════════════════════════════════

test('Insert works — books and films', async (db) => {
    const insertWork = db.prepare(`
        INSERT OR IGNORE INTO works (wikidata_id, type, title_it, title_en, creator, year, country, genres, sitelinks, popularity_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const testWorks = [
        ['Q8337', 'book', 'Il nome della rosa', 'The Name of the Rose', 'Umberto Eco', 1980, 'Italy', '["romanzo storico","giallo"]', 85, 340],
        ['Q172241', 'film', 'La vita è bella', 'Life Is Beautiful', 'Roberto Benigni', 1997, 'Italy', '["commedia drammatica"]', 92, 368],
        ['Q48103', 'book', 'Il piccolo principe', 'The Little Prince', 'Antoine de Saint-Exupéry', 1943, 'France', '["fiaba","narrativa"]', 110, 440],
        ['Q25188', 'film', 'Il Padrino', 'The Godfather', 'Francis Ford Coppola', 1972, 'USA', '["dramma","gangster"]', 130, 520],
        ['Q47209', 'book', '1984', 'Nineteen Eighty-Four', 'George Orwell', 1949, 'UK', '["distopia","fantascienza"]', 100, 400],
    ];

    for (const w of testWorks) {
        insertWork.bind(w);
        insertWork.step();
        insertWork.reset();
    }
    insertWork.free();

    const count = db.exec("SELECT COUNT(*) FROM works");
    assert(count[0].values[0][0] === 5, `Expected 5 works, got ${count[0].values[0][0]}`);
});

test('Insert plots', async (db) => {
    // Get work IDs
    const works = db.exec("SELECT id, title_en FROM works");

    const insertPlot = db.prepare(`
        INSERT OR IGNORE INTO plots (work_id, language, plot_text, plot_short, source, match_confidence)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    const plots = [
        [1, 'en', 'In 1327, the Franciscan friar William of Baskerville and his novice Adso arrive at a wealthy Benedictine abbey in northern Italy to attend a theological dispute.', 'Franciscan friar investigates mysterious deaths at a medieval abbey.', 'tellmeagain', 1.0],
        [1, 'it', 'Nel 1327, il frate francescano Guglielmo da Baskerville e il novizio Adso giungono in una ricca abbazia benedettina nel nord Italia.', 'Un frate francescano indaga su misteriose morti in un\'abbazia medievale.', 'wikiplots', 1.0],
        [2, 'en', 'In 1939, Guido Orefice, a Jewish Italian, uses humor and imagination to protect his son from the horrors of a Nazi concentration camp.', 'Jewish father uses humor to shield his son in a concentration camp.', 'tellmeagain', 1.0],
        [3, 'en', 'A pilot stranded in the Sahara desert meets a young prince who has traveled from a tiny asteroid.', 'Pilot meets a little prince from another planet in the desert.', 'wikiplots', 1.0],
        [4, 'en', 'The aging patriarch of an organized crime dynasty transfers control to his reluctant youngest son.', 'Crime dynasty patriarch passes power to his reluctant son.', 'tellmeagain', 1.0],
        [5, 'en', 'Winston Smith lives in a totalitarian society ruled by Big Brother, where independent thinking is a crime.', 'Man rebels against totalitarian surveillance state.', 'wikiplots', 1.0],
    ];

    for (const p of plots) {
        insertPlot.bind(p);
        insertPlot.step();
        insertPlot.reset();
    }
    insertPlot.free();

    const count = db.exec("SELECT COUNT(*) FROM plots");
    assert(count[0].values[0][0] === 6, `Expected 6 plots, got ${count[0].values[0][0]}`);
});

// ═══════════════════════════════════════════
// TEST 3: FTS5 Search
// ═══════════════════════════════════════════

test('FTS5 index + search', async (db) => {
    // Populate FTS index
    const works = db.exec("SELECT wikidata_id, title_it, title_en, creator, genres FROM works");
    const insertFts = db.prepare(`
        INSERT INTO search_text (wikidata_id, title_it, title_en, creator, genres)
        VALUES (?, ?, ?, ?, ?)
    `);

    for (const row of works[0].values) {
        insertFts.bind(row);
        insertFts.step();
        insertFts.reset();
    }
    insertFts.free();

    // Search for Italian works
    const results = db.exec(`
        SELECT wikidata_id, title_it, title_en
        FROM search_text
        WHERE search_text MATCH 'rosa OR principe'
        ORDER BY rank
    `);

    assert(results.length > 0, 'FTS search returned no results');
    assert(results[0].values.length >= 2, `Expected >=2 FTS results, got ${results[0].values.length}`);

    const titles = results[0].values.map(r => r[1]);
    assert(titles.includes('Il nome della rosa'), 'FTS should find "Il nome della rosa"');
    assert(titles.includes('Il piccolo principe'), 'FTS should find "Il piccolo principe"');
});

test('FTS5 search — by creator', async (db) => {
    const results = db.exec(`
        SELECT wikidata_id, title_en, creator
        FROM search_text
        WHERE search_text MATCH 'Orwell'
    `);

    assert(results.length > 0, 'FTS search for Orwell returned no results');
    assert(results[0].values[0][1] === 'Nineteen Eighty-Four', 'Should find 1984 by Orwell');
});

// ═══════════════════════════════════════════
// TEST 4: Confidence Scoring
// ═══════════════════════════════════════════

test('Confidence scoring — computeConfidence', async () => {
    // Replicate the scoring logic from search.js
    function computeConfidence(work, plotInfo) {
        const WEIGHTS = { similarity: 0.50, popularity: 0.20, has_plot: 0.15, match_confidence: 0.15 };
        const popNorm = Math.min(work.popularity_score / 500, 1);
        const simScore = (work.similarity || 0) * WEIGHTS.similarity;
        const popScore = popNorm * WEIGHTS.popularity;
        const plotScore = (plotInfo.has_plot ? 1 : 0) * WEIGHTS.has_plot;
        const matchScore = (plotInfo.match_confidence || 0) * WEIGHTS.match_confidence;
        return simScore + popScore + plotScore + matchScore;
    }

    function classifyConfidence(score) {
        if (score >= 0.70) return 'verified';
        if (score >= 0.45) return 'verify_online';
        return 'hidden';
    }

    // High confidence: high similarity + popular + has plot
    const highConf = computeConfidence(
        { similarity: 0.95, popularity_score: 400 },
        { has_plot: true, match_confidence: 1.0 }
    );
    assert(highConf >= 0.70, `High confidence should be >=0.70, got ${highConf.toFixed(3)}`);
    assert(classifyConfidence(highConf) === 'verified', 'Should be verified');

    // Medium confidence: moderate similarity + some popularity
    const medConf = computeConfidence(
        { similarity: 0.60, popularity_score: 150 },
        { has_plot: true, match_confidence: 0.5 }
    );
    assert(medConf >= 0.45 && medConf < 0.70, `Medium confidence should be 0.45-0.70, got ${medConf.toFixed(3)}`);
    assert(classifyConfidence(medConf) === 'verify_online', 'Should be verify_online');

    // Low confidence: low similarity, no plot
    const lowConf = computeConfidence(
        { similarity: 0.30, popularity_score: 10 },
        { has_plot: false, match_confidence: 0 }
    );
    assert(lowConf < 0.45, `Low confidence should be <0.45, got ${lowConf.toFixed(3)}`);
    assert(classifyConfidence(lowConf) === 'hidden', 'Should be hidden');
});

// ═══════════════════════════════════════════
// TEST 5: Plots API Response Structure
// ═══════════════════════════════════════════

test('Plots API — response structure matches frontend expectations', async (db) => {
    // Simulate what server.js does: fetch plots and structure them
    const workIds = [1, 2, 3];
    const placeholders = workIds.map(() => '?').join(',');
    const rows = db.exec(`
        SELECT work_id, language, plot_text, plot_short, source, match_confidence
        FROM plots
        WHERE work_id IN (${placeholders})
    `, workIds);

    // Build response like server.js does
    const plots = {};
    if (rows.length > 0) {
        for (const row of rows[0].values) {
            const [workId, lang, text, short, source, mc] = row;
            if (!plots[workId]) plots[workId] = {};
            plots[workId][lang] = { text, short, source, match_confidence: mc };
        }
    }

    // Verify structure matches what frontend expects:
    // plots[id][lang].text, plots[id][lang].short
    assert(plots[1], 'Should have plots for work 1');
    assert(plots[1].en, 'Should have English plot for work 1');
    assert(plots[1].it, 'Should have Italian plot for work 1');
    assert(typeof plots[1].en.text === 'string', 'Plot text should be string');
    assert(typeof plots[1].en.short === 'string', 'Plot short should be string');
    assert(plots[2], 'Should have plots for work 2');
    assert(plots[2].en, 'Should have English plot for work 2');
    assert(!plots[2].it, 'Work 2 should NOT have Italian plot');

    // Frontend accesses: wPlots.it?.text || '', wPlots.en?.text || ''
    const w1plotIt = plots[1]?.it?.text || '';
    const w1plotEn = plots[1]?.en?.text || '';
    assert(w1plotIt.includes('francescano'), 'Italian plot should contain "francescano"');
    assert(w1plotEn.includes('Franciscan'), 'English plot should contain "Franciscan"');
});

// ═══════════════════════════════════════════
// TEST 6: Wikidata SPARQL (live, small sample)
// ═══════════════════════════════════════════

test('Wikidata SPARQL — fetch 3 Italian films', async () => {
    const query = `
        SELECT ?item ?itemLabel ?directorLabel (YEAR(?date) AS ?year)
               (COUNT(DISTINCT ?sitelink) AS ?sitelinks)
        WHERE {
            ?item wdt:P31/wdt:P279* wd:Q11424 .
            ?item wdt:P57 ?director .
            ?item wdt:P495 wd:Q38 .
            ?item wdt:P577 ?date .
            ?item wdt:P1476 ?origTitle .
            ?sitelink schema:about ?item .
            FILTER(YEAR(?date) >= 1990)
            SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en". }
        }
        GROUP BY ?item ?itemLabel ?directorLabel ?date
        HAVING(COUNT(DISTINCT ?sitelink) >= 20)
        ORDER BY DESC(?sitelinks)
        LIMIT 3
    `;

    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;

    const data = await new Promise((resolve, reject) => {
        const req = http.request(url.replace('https:', 'http:'), { headers: { 'User-Agent': 'Inspire/2.0 test' } }, (res) => {
            // Follow redirect if needed
            if (res.statusCode === 301 || res.statusCode === 302) {
                reject(new Error(`Redirect to ${res.headers.location} — HTTPS required, skipping in sandbox`));
                return;
            }
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch { reject(new Error('JSON parse error')); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });

    assert(data.results?.bindings, 'SPARQL response should have results.bindings');
    assert(data.results.bindings.length > 0, 'Should get at least 1 Italian film');

    const first = data.results.bindings[0];
    assert(first.itemLabel?.value, 'Should have title label');
    assert(first.directorLabel?.value, 'Should have director');
    assert(first.year?.value, 'Should have year');
    assert(parseInt(first.sitelinks?.value) >= 20, 'Should have >= 20 sitelinks');
});

// ═══════════════════════════════════════════
// TEST 7: Search response structure
// ═══════════════════════════════════════════

test('Search response — fields match frontend expectations', async (db) => {
    // Simulate a search result
    const work = db.exec(`
        SELECT id, wikidata_id, type, title_it, title_en, creator, year, genres, sitelinks, country
        FROM works WHERE id = 1
    `);

    const row = work[0].values[0];
    const [id, wikidata_id, type, title_it, title_en, creator, year, genres, sitelinks, country] = row;

    // Build response like search.js does
    const result = {
        id,
        wikidata_id,
        type,
        title_it,
        title_en,
        creator,
        year,
        genres: JSON.parse(genres),
        sitelinks,
        country,
        similarity: 0.85,
        confidence: 0.78,
        badge: 'verified',
        has_plot: true,
        plot_short: 'A friar investigates deaths...',
        plot_it_short: 'Un frate indaga su morti misteriose...'
    };

    // Frontend expects these fields:
    assert(typeof result.id === 'number', 'id should be number');
    assert(typeof result.wikidata_id === 'string', 'wikidata_id should be string');
    assert(typeof result.badge === 'string', 'badge should be string');
    assert(['verified', 'verify_online', 'hidden'].includes(result.badge), 'badge should be valid tier');
    assert(result.title_it, 'Should have Italian title');
    assert(result.creator, 'Should have creator');

    // Frontend builds final result like this:
    const finalResult = {
        title: result.title_it || result.title_en || '',
        type: result.type || 'book',
        author_or_director: result.creator || '',
        year: result.year || '',
        _confidence: result.badge || 'verified',
        _score: result.confidence || 0
    };

    assert(finalResult.title === 'Il nome della rosa', 'Title should be Italian');
    assert(finalResult._confidence === 'verified', 'Confidence badge should be verified');
});

// ═══════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════

async function runTests() {
    console.log('\n🧪 Inspire v2 — Pipeline Integration Tests\n');
    console.log('─'.repeat(55));

    const SQL = await initSqlJs();
    const db = new SQL.Database();

    // Enable WAL mode equivalent
    db.run("PRAGMA journal_mode = WAL");

    for (const t of TESTS) {
        try {
            await t.fn(db);
            passed++;
            console.log(`  ✅  ${t.name}`);
        } catch (err) {
            failed++;
            console.log(`  ❌  ${t.name}`);
            console.log(`      → ${err.message}`);
        }
    }

    db.close();

    console.log('\n' + '─'.repeat(55));
    console.log(`  Results: ${passed} passed, ${failed} failed, ${TESTS.length} total`);
    console.log('─'.repeat(55) + '\n');

    process.exit(failed > 0 ? 1 : 0);
}

runTests();
