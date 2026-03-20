'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../db');

const LOG_FILE = path.join(__dirname, '..', '..', 'disney_import_log.txt');
function log(msg) {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

// --- Step 1: Get Disney/Pixar animated films from Wikidata SPARQL ---

async function fetchDisneyPixarFromWikidata() {
    // Query: animated films produced by Walt Disney Pictures OR Pixar
    // P272 = production company
    // Q191224 = Pixar, Q166886 = Walt Disney Animation Studios, Q176819 = Walt Disney Pictures
    const sparql = `
SELECT DISTINCT ?film ?filmLabel ?filmLabelIt ?year ?directorLabel ?genres ?sitelinks WHERE {
  ?film wdt:P31 wd:Q11424 .
  { ?film wdt:P272 wd:Q191224 } UNION
  { ?film wdt:P272 wd:Q166886 } UNION
  { ?film wdt:P272 wd:Q176819 } .
  ?film wdt:P577 ?date .
  OPTIONAL { ?film wdt:P57 ?director }
  OPTIONAL { ?film wdt:P136 ?genre }
  BIND(YEAR(?date) AS ?year)
  ?film wikibase:sitelinks ?sitelinks .
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en" .
    ?film rdfs:label ?filmLabel .
    ?director rdfs:label ?directorLabel .
  }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "it" .
    ?film rdfs:label ?filmLabelIt .
  }
  FILTER(?sitelinks > 10)
}
ORDER BY DESC(?sitelinks)
LIMIT 200`;

    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
    log('Fetching Disney/Pixar films from Wikidata...');

    const res = await fetch(url, {
        headers: {
            'User-Agent': 'InspireMe2-Bot/1.0 (educational project)',
            'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(30000)
    });

    if (!res.ok) throw new Error(`Wikidata SPARQL error: ${res.status}`);
    const data = await res.json();
    const bindings = data.results?.bindings || [];

    // Group by film (may have multiple genres)
    const films = new Map();
    for (const b of bindings) {
        const qid = b.film.value.split('/').pop();
        if (!films.has(qid)) {
            films.set(qid, {
                wikidata_id: qid,
                title_en: b.filmLabel?.value || '',
                title_it: b.filmLabelIt?.value || '',
                year: parseInt(b.year?.value) || null,
                creator: b.directorLabel?.value || '',
                sitelinks: parseInt(b.sitelinks?.value) || 0,
                genres: new Set()
            });
        }
        // Genre names would need another query, skip for now
    }

    log(`Found ${films.size} Disney/Pixar films from Wikidata`);
    return Array.from(films.values());
}

// --- Step 2: Fetch plot from Wikipedia ---

async function fetchPlotFromWikipedia(title, lang = 'en') {
    try {
        // Get the Wikipedia page content
        const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'InspireMe2-Bot/1.0' },
            signal: AbortSignal.timeout(10000)
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.extract || null;
    } catch {
        return null;
    }
}

async function fetchFullPlotFromWikipedia(title, lang = 'en') {
    try {
        // Try to get the Plot section from the full article
        const url = `https://${lang}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&section=1&format=json`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'InspireMe2-Bot/1.0' },
            signal: AbortSignal.timeout(10000)
        });
        if (!res.ok) return null;
        const data = await res.json();
        let wikitext = data.parse?.wikitext?.['*'] || '';

        // Clean wikitext → plain text (basic cleanup)
        wikitext = wikitext
            .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2') // [[link|text]] → text
            .replace(/'''([^']+)'''/g, '$1') // bold
            .replace(/''([^']+)''/g, '$1')   // italic
            .replace(/\{\{[^}]+\}\}/g, '')   // templates
            .replace(/<ref[^>]*>.*?<\/ref>/gs, '') // references
            .replace(/<ref[^/]*\/>/g, '')     // self-closing refs
            .replace(/<[^>]+>/g, '')          // HTML tags
            .replace(/\n{3,}/g, '\n\n')       // multiple newlines
            .trim();

        if (wikitext.length > 50) return wikitext;
        return null;
    } catch {
        return null;
    }
}

// --- Step 3: Import into DB ---

async function importAll() {
    fs.writeFileSync(LOG_FILE, '');
    log('=== Import Disney/Pixar Films ===\n');

    const d = db.getDb();

    // Check existing films
    const existing = new Set(
        d.prepare('SELECT wikidata_id FROM works WHERE wikidata_id IS NOT NULL').all()
            .map(r => r.wikidata_id)
    );
    log(`Existing works in DB: ${existing.size}`);

    // Fetch from Wikidata
    let films;
    try {
        films = await fetchDisneyPixarFromWikidata();
    } catch (err) {
        log(`ERRORE Wikidata: ${err.message}`);
        process.exit(1);
    }

    // Filter out already-existing
    const newFilms = films.filter(f => !existing.has(f.wikidata_id));
    log(`New films to import: ${newFilms.length} (${films.length - newFilms.length} already exist)\n`);

    const insertWork = d.prepare(`
        INSERT OR IGNORE INTO works (wikidata_id, type, title_it, title_en, creator, year, genres, sitelinks, country)
        VALUES (?, 'movie', ?, ?, ?, ?, ?, ?, 'US')
    `);

    const insertPlot = d.prepare(`
        INSERT OR IGNORE INTO plots (work_id, language, plot_text)
        VALUES (?, ?, ?)
    `);

    let imported = 0;
    let withPlot = 0;

    for (let i = 0; i < newFilms.length; i++) {
        const f = newFilms[i];
        log(`[${i + 1}/${newFilms.length}] ${f.title_en} (${f.year}) - ${f.creator}`);

        // Insert work
        const genres = JSON.stringify(['animated film', 'family film']);
        try {
            insertWork.run(f.wikidata_id, f.title_it, f.title_en, f.creator, f.year, genres, f.sitelinks);
        } catch (e) {
            log(`  Skip (already exists or error): ${e.message}`);
            continue;
        }

        // Get the inserted ID
        const row = d.prepare('SELECT id FROM works WHERE wikidata_id = ?').get(f.wikidata_id);
        if (!row) { log('  Could not find inserted row'); continue; }
        const workId = row.id;

        // Fetch plots from Wikipedia
        const titleEn = f.title_en.replace(/ /g, '_');
        const titleIt = f.title_it.replace(/ /g, '_');

        // Try full plot first, then summary
        let plotEn = await fetchFullPlotFromWikipedia(titleEn + '_(film)', 'en');
        if (!plotEn) plotEn = await fetchFullPlotFromWikipedia(titleEn, 'en');
        if (!plotEn) plotEn = await fetchPlotFromWikipedia(titleEn + '_(film)', 'en');
        if (!plotEn) plotEn = await fetchPlotFromWikipedia(titleEn, 'en');

        let plotIt = await fetchPlotFromWikipedia(titleIt + '_(film)', 'it');
        if (!plotIt) plotIt = await fetchPlotFromWikipedia(titleIt, 'it');

        if (plotEn) {
            insertPlot.run(workId, 'en', plotEn.substring(0, 5000));
            withPlot++;
        }
        if (plotIt) {
            insertPlot.run(workId, 'it', plotIt.substring(0, 5000));
        }

        imported++;
        log(`  Imported (plot EN: ${plotEn ? 'yes' : 'no'}, IT: ${plotIt ? 'yes' : 'no'})`);

        // Small delay to be nice to Wikipedia API
        await new Promise(r => setTimeout(r, 200));
    }

    log(`\n=== DONE ===`);
    log(`Imported: ${imported} films, ${withPlot} with plots`);

    db.close();
    return { imported, withPlot, total: newFilms.length };
}

importAll().then(r => {
    log(`Result: ${JSON.stringify(r)}`);
    process.exit(0);
}).catch(e => {
    log(`Fatal: ${e.message}`);
    process.exit(1);
});
