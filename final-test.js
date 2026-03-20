'use strict';
const queries = [
    "un romanzo distopico dove il governo controlla tutto",
    "a movie about time travel and paradoxes",
    "libro fantasy con draghi e magia medievale",
    "romantic comedy set in New York",
    "un giallo ambientato in Italia con un detective",
    "science fiction about artificial intelligence taking over",
    "manga about fighting tournaments and superpowers",
    "a philosophical novel about the meaning of life",
    "horror movie with ghosts in a haunted house",
    "poesia epica dell antichita"
];

async function test() {
    console.log('=== FINAL TEST: 10 queries ===\n');
    for (const q of queries) {
        try {
            const r = await fetch('http://localhost:3456/api/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q, limit: 3 }),
                signal: AbortSignal.timeout(30000)
            });
            const data = await r.json();
            console.log(`Q: "${q}"`);
            if (data.results && data.results.length > 0) {
                for (const res of data.results.slice(0, 3)) {
                    const title = res.title_en || res.title_it || '?';
                    const conf = res.confidence ? res.confidence.toFixed(2) : '?';
                    const badge = res.confidence_badge || '?';
                    const hasPlot = res.plot_short ? 'YES' : 'no';
                    console.log(`  [${res.type}] ${title} (${res.year||'?'}) conf=${conf} badge=${badge} plot=${hasPlot}`);
                }
            } else { console.log(`  NO RESULTS`); }
            console.log('');
        } catch (e) { console.log(`  ERROR: ${e.message}\n`); }
    }
}
test();
