'use strict';
const fs = require('fs');
const path = require('path');
const LOG = path.join(__dirname, '..', '..', 'test_search_out.txt');

function log(msg) {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG, line + '\n');
}

async function testSearch(query, type) {
    log(`\n=== TEST: "${query}" (${type}) ===`);
    const t = Date.now();
    try {
        const res = await fetch('http://localhost:3457/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, type, limit: 5 }),
            signal: AbortSignal.timeout(180000) // 3 min max
        });
        const data = await res.json();
        const elapsed = ((Date.now() - t) / 1000).toFixed(1);

        log(`Tempo: ${elapsed}s`);
        if (data.expanded_query) {
            log(`QUERY ESPANSA: ${data.expanded_query.substring(0, 300)}`);
        } else {
            log('QUERY ESPANSA: (nessuna espansione)');
        }
        log(`Risultati: ${data.results?.length || 0}`);
        for (const w of (data.results || [])) {
            log(`  - ${w.title_it || w.title_en} (${w.year}) [${w.rrf_score?.toFixed(4)}] ${w.creator || ''}`);
            if (w.why) log(`    WHY: ${w.why.substring(0, 100)}...`);
        }
    } catch (err) {
        log(`ERRORE: ${err.message} (dopo ${((Date.now()-t)/1000).toFixed(1)}s)`);
    }
}

async function main() {
    fs.writeFileSync(LOG, '');
    log('=== Test Query Expansion ===\n');

    // Test 1: Film mondo inizio 1900
    await testSearch('Aiutami a comprendere il mondo agli inizi del 1900', 'movie');

    // Test 2: Libro rispetto regole
    await testSearch('Aiutami a far capire a mio figlio l\'importanza del rispetto delle regole di un gioco', 'book');

    // Test 3: Query generica
    await testSearch('Qualcosa che mi faccia riflettere sulla solitudine', 'all');

    log('\n=== FINE TEST ===');
}

main().catch(e => log(`Fatal: ${e.message}`));
