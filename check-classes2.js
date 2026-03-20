'use strict';
const classes = [
    { qid: 'Q7725634', label: 'literary work (existing)' },
    { qid: 'Q571', label: 'book' },
    { qid: 'Q8261', label: 'novel' },
    { qid: 'Q25379', label: 'play/theatre' },
    { qid: 'Q5185279', label: 'poem' },
    { qid: 'Q35760', label: 'essay' },
    { qid: 'Q49848', label: 'document/religious text' },
    { qid: 'Q17518461', label: 'creative work' },
    { qid: 'Q21198342', label: 'manga series' },
    { qid: 'Q1667921', label: 'novel series/saga' },
    { qid: 'Q747381', label: 'graphic novel' },
    { qid: 'Q7889', label: 'video game' },
    { qid: 'Q386724', label: 'work (generic)' },
    { qid: 'Q49084', label: 'short story collection (existing)' },
    { qid: 'Q725377', label: 'comic book series (existing)' },
];

async function checkCounts() {
    console.log('=== Wikidata Class Counts (with P279* subclass chain) ===\n');
    console.log('Using wdt:P31/wdt:P279* (transitive) with sitelinks >= 5\n');
    for (const cls of classes) {
        const query = `SELECT (COUNT(DISTINCT ?item) AS ?count) WHERE {
            ?item wdt:P31/wdt:P279* wd:${cls.qid} .
            ?item wikibase:sitelinks ?sl . FILTER(?sl >= 5)
        }`;
        const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': 'InspireMeBot/2.0', 'Accept': 'application/sparql-results+json' },
                signal: AbortSignal.timeout(60000)
            });
            if (!res.ok) { console.log(`  ${cls.qid} ${cls.label}: HTTP ${res.status}`); continue; }
            const data = await res.json();
            const count = data.results?.bindings?.[0]?.count?.value || '?';
            console.log(`  ${cls.qid} ${cls.label}: ${count}`);
        } catch (e) { console.log(`  ${cls.qid} ${cls.label}: ERROR ${e.message}`); }
        await new Promise(r => setTimeout(r, 3000));
    }
}
checkCounts();
