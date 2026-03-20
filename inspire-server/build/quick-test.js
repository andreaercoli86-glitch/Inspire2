'use strict';
const fs = require('fs');
const path = require('path');
const LOG = path.join(__dirname, '..', '..', 'quick_test_log.txt');

async function main() {
    fs.writeFileSync(LOG, 'Starting test...\n');
    const start = Date.now();

    try {
        const res = await fetch('http://localhost:3457/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: 'Cerco l\'ispirazione per un viaggio in paesi esotici. Trova un film che sia ambientato in quei luoghi.',
                type: 'movie',
                limit: 15
            }),
            signal: AbortSignal.timeout(300000)
        });
        const data = await res.json();
        const ms = Date.now() - start;

        let out = `Query completed in ${ms}ms\n`;
        if (data.expanded_query) {
            out += `Expanded (full): ${data.expanded_query}\n`;
        }
        out += `Results: ${data.results?.length || 0} (total: ${data.total_found})\n\n`;

        (data.results || []).forEach((r, i) => {
            out += `${(i+1).toString().padStart(2)}. [${r.badge}] conf=${r.confidence} rrf=${r.rrf_score} sim=${r.similarity} | ${r.title_it || r.title_en} (${r.year}) sitelinks=${r.sitelinks} | vec=${r._vec_rank} bm25=${r._bm25_rank} plot=${r._plot_match_count || 0} title=${r._title_match || false}\n`;
            if (r.why) out += `    WHY: ${r.why.substring(0, 150)}\n`;
            out += `\n`;
        });

        fs.writeFileSync(LOG, out);
        console.log('Done in ' + ms + 'ms');
    } catch(e) {
        fs.writeFileSync(LOG, 'ERROR: ' + e.message + '\n' + e.stack);
        console.error('ERROR:', e.message);
    }
}

main();
