'use strict';

const classes = [
    { qid: 'Q25379', label: 'play (theatre)' },
    { qid: 'Q5185279', label: 'poem' },
    { qid: 'Q35760', label: 'essay' },
    { qid: 'Q1667921', label: 'novel series/saga' },
    { qid: 'Q21198342', label: 'manga series' },
    { qid: 'Q747381', label: 'graphic novel' },
    { qid: 'Q17518461', label: 'creative work' },
    { qid: 'Q27560760', label: 'writing (general)' },
    { qid: 'Q7725634', label: 'literary work (existing)' },
    { qid: 'Q571', label: 'book (existing)' },
    { qid: 'Q8261', label: 'novel (existing)' },
];

async function checkCounts() {
    for (const cls of classes) {
        const query = `SELECT (COUNT(DISTINCT ?item) AS ?count) WHERE {
            ?item wdt:P31 wd:${cls.qid} .
            ?item wikibase:sitelinks ?sl . FILTER(?sl >= 5)
        }`;
        const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': 'InspireMeBot/2.0', 'Accept': 'application/sparql-results+json' },
                signal: AbortSignal.timeout(30000)
            });
            if (!res.ok) { console.log(`  ${cls.qid} ${cls.label}: HTTP ${res.status}`); continue; }
            const data = await res.json();
            const count = data.results?.bindings?.[0]?.count?.value || '?';
            console.log(`  ${cls.qid} ${cls.label}: ${count} items (sitelinks >= 5)`);
        } catch (e) { console.log(`  ${cls.qid} ${cls.label}: ERROR ${e.message}`); }
        await new Promise(r => setTimeout(r, 2000));
    }
}
checkCounts();
