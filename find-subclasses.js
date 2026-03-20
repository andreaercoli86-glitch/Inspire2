'use strict';
async function main() {
    console.log('Finding direct subclasses of Q7725634 (literary work) with item counts...\n');
    const query = `
SELECT ?subclass ?subclassLabel (COUNT(DISTINCT ?item) AS ?count) WHERE {
    ?subclass wdt:P279 wd:Q7725634 .
    ?item wdt:P31 ?subclass .
    ?item wikibase:sitelinks ?sl . FILTER(?sl >= 5)
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
GROUP BY ?subclass ?subclassLabel
HAVING(COUNT(DISTINCT ?item) >= 20)
ORDER BY DESC(?count)
    `;
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
    const res = await fetch(url, {
        headers: { 'User-Agent': 'InspireMeBot/2.0', 'Accept': 'application/sparql-results+json' },
        signal: AbortSignal.timeout(120000)
    });
    if (!res.ok) { console.log('HTTP ' + res.status); return; }
    const data = await res.json();
    let total = 0;
    for (const b of data.results.bindings) {
        const qid = b.subclass.value.split('/').pop();
        const label = b.subclassLabel?.value || '?';
        const count = parseInt(b.count.value);
        total += count;
        console.log(`  ${qid} ${label}: ${count}`);
    }
    console.log(`\n  TOTAL items across all subclasses: ${total}`);
}
main();
