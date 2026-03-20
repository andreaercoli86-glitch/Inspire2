const db = require('../db');
const d = db.getDb();

// First, check actual schema
const cols = d.prepare("PRAGMA table_info(works)").all().map(c => c.name);
console.log("Works columns:", cols.join(', '));

// Step 1: Remaining duplicates (should be 0)
const stillDuplicates = d.prepare(`
    SELECT p.work_id, w.title_en, w.title_it, p.language, COUNT(*) as cnt
    FROM plots p
    JOIN works w ON p.work_id = w.id
    GROUP BY p.work_id, p.language
    HAVING cnt > 1
    ORDER BY cnt DESC
    LIMIT 20
`).all();

console.log("\n=== REMAINING DUPLICATES (should be 0) ===");
console.log("Count:", stillDuplicates.length);
if (stillDuplicates.length > 0) {
    stillDuplicates.forEach(r => console.log(`  ${r.title_en} (${r.language}): ${r.cnt} plots`));
}

// Step 2: Spot check known titles that commonly have duplicates
const sample = d.prepare(`
    SELECT w.id, w.title_en, w.title_it, w.type,
           substr(p.plot_text, 1, 200) as plot_snippet,
           substr(e.why_text, 1, 250) as why_snippet,
           length(p.plot_text) as plot_len
    FROM works w
    JOIN plots p ON w.id = p.work_id AND p.language = 'en'
    JOIN enrichments e ON w.id = e.work_id AND e.language = 'it'
    WHERE w.title_en IN (
        'The Beach', 'Crash', 'Twilight', 'The Ring', 'Ghost',
        'Troy', 'Blade', 'Frozen', 'Cars', 'Up', 'Brave',
        'Home', 'Click', 'Holes', 'Monster', 'Gold', 'Signs',
        'Nine', 'Tusk', 'Hugo'
    )
    ORDER BY w.title_en
`).all();

console.log("\n=== SPOT CHECK: Known ambiguous titles ===");
sample.forEach(r => {
    console.log(`\n--- ${r.title_en} (${r.title_it || 'N/A'}) [${r.type}] ---`);
    console.log(`  Plot (${r.plot_len} chars): ${r.plot_snippet}...`);
    console.log(`  WHY: ${r.why_snippet}`);
});

// Step 3: Cross-contamination — anime keywords in non-anime enrichments
const animeInFilms = d.prepare(`
    SELECT w.id, w.title_en, w.title_it, w.type,
           substr(e.why_text, 1, 250) as why_snippet
    FROM enrichments e
    JOIN works w ON e.work_id = w.id
    WHERE e.language = 'it'
    AND w.type IN ('movie', 'film')
    AND (e.why_text LIKE '%anime%' OR e.why_text LIKE '%manga%' OR e.why_text LIKE '%shinigami%'
         OR e.why_text LIKE '%shonen%' OR e.why_text LIKE '%ninja%'
         OR e.why_text LIKE '%Soul Society%' OR e.why_text LIKE '%Hollow%')
    LIMIT 10
`).all();

console.log("\n=== CROSS-CONTAMINATION: Anime terms in movie WHY text ===");
console.log("Found:", animeInFilms.length);
animeInFilms.forEach(r => {
    console.log(`  ${r.title_en} [${r.type}]: ${r.why_snippet}`);
});

// Step 4: Check plot coherence — find enrichments where title is NOT mentioned
// but plot is about something completely different (heuristic: plot mentions different title)
const suspiciousPlots = d.prepare(`
    SELECT w.id, w.title_en, w.title_it,
           substr(p.plot_text, 1, 250) as plot_snippet,
           substr(e.why_text, 1, 200) as why_snippet
    FROM works w
    JOIN plots p ON w.id = p.work_id AND p.language = 'en'
    JOIN enrichments e ON w.id = e.work_id AND e.language = 'it'
    WHERE e.why_text NOT LIKE '%affronta temi di%'
    AND (
        (w.title_en = 'Crash' AND p.plot_text NOT LIKE '%Los Angeles%' AND p.plot_text NOT LIKE '%car%' AND p.plot_text NOT LIKE '%race%' AND p.plot_text NOT LIKE '%racial%')
        OR (w.title_en = 'Frozen' AND p.plot_text NOT LIKE '%Anna%' AND p.plot_text NOT LIKE '%Elsa%' AND p.plot_text NOT LIKE '%ice%' AND p.plot_text NOT LIKE '%snow%')
        OR (w.title_en = 'Ghost' AND p.plot_text NOT LIKE '%Sam%' AND p.plot_text NOT LIKE '%Molly%' AND p.plot_text NOT LIKE '%ghost%' AND p.plot_text NOT LIKE '%spirit%' AND p.plot_text NOT LIKE '%dead%')
        OR (w.title_en = 'The Ring' AND p.plot_text NOT LIKE '%video%' AND p.plot_text NOT LIKE '%tape%' AND p.plot_text NOT LIKE '%Samara%' AND p.plot_text NOT LIKE '%cursed%')
        OR (w.title_en = 'Blade' AND p.plot_text NOT LIKE '%vampire%' AND p.plot_text NOT LIKE '%Blade%')
    )
`).all();

console.log("\n=== SUSPICIOUS PLOT MISMATCHES ===");
console.log("Found:", suspiciousPlots.length);
suspiciousPlots.forEach(r => {
    console.log(`\n  ${r.title_en}: Plot: ${r.plot_snippet}`);
    console.log(`  WHY: ${r.why_snippet}`);
});

// Step 5: Random sample of 15 LLM enrichments
const randomSample = d.prepare(`
    SELECT w.id, w.title_en, w.title_it, w.type,
           substr(p.plot_text, 1, 100) as plot_start,
           substr(e.why_text, 1, 200) as why_snippet
    FROM enrichments e
    JOIN works w ON e.work_id = w.id
    JOIN plots p ON w.id = p.work_id AND p.language = 'en'
    WHERE e.language = 'it'
    AND e.why_text NOT LIKE '%affronta temi di%'
    ORDER BY RANDOM()
    LIMIT 15
`).all();

console.log("\n=== RANDOM SAMPLE (15 LLM enrichments) ===");
randomSample.forEach(r => {
    console.log(`\n--- ${r.title_en} (${r.title_it || 'N/A'}) [${r.type}] ---`);
    console.log(`  Plot: ${r.plot_start}...`);
    console.log(`  WHY: ${r.why_snippet}`);
});

db.close();
