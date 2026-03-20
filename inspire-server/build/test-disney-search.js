'use strict';
const fs = require('fs');
const path = require('path');
const LOG = path.join(__dirname, '..', '..', 'test_search_log.txt');

async function test(query, type = 'movie') {
    const start = Date.now();
    const res = await fetch('http://localhost:3457/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, type, limit: 10 }),
        signal: AbortSignal.timeout(180000)
    });
    const data = await res.json();
    const ms = Date.now() - start;

    let out = `\n=== Query: "${query}" (${ms}ms) ===\n`;
    if (data.expanded_query) {
        const expanded = data.expanded_query.replace(query, '').trim();
        out += `Expanded: ${expanded.substring(0, 200)}\n`;
    }
    out += `Results: ${data.results?.length || 0} (total: ${data.total_found})\n\n`;

    (data.results || []).forEach((r, i) => {
        out += `${i+1}. [${r.badge}] conf=${r.confidence} rrf=${r.rrf_score} | ${r.title_it || r.title_en} (${r.year}) | vec=${r._vec_rank} bm25=${r._bm25_rank} agree=${r._agreement}\n`;
        if (r.why) out += `   WHY: ${r.why.substring(0, 120)}\n`;
        out += `\n`;
    });
    return out;
}

async function main() {
    fs.writeFileSync(LOG, '');
    const queries = [
        'Vorrei appassionarmi ad un percorso accademico. Fammi vedere un film che parla di un grande scienziato.'
    ];

    for (const q of queries) {
        console.log(`Testing: "${q.substring(0, 60)}..."...`);
        try {
            const result = await test(q);
            fs.appendFileSync(LOG, result);
            console.log('OK');
        } catch(e) {
            fs.appendFileSync(LOG, `\n=== ERROR: ${e.message}\n`);
            console.log('ERROR: ' + e.message);
        }
    }
    console.log('Done!');
}

main();
