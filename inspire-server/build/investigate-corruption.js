'use strict';
const db = require('../db');
const d = db.getDb();

console.log('=== INVESTIGATION: Data Corruption Check ===\n');

// 1. Check The Beach specifically
console.log('--- THE BEACH (id should be around 4827 or similar) ---');
const beach = d.prepare("SELECT * FROM works WHERE title_en LIKE '%Beach%' AND year = 2000").all();
for (const w of beach) {
    console.log(`Work: id=${w.id} "${w.title_it}" / "${w.title_en}" (${w.year}) sitelinks=${w.sitelinks}`);
    
    // Get ALL plots for this work
    const plots = d.prepare("SELECT * FROM plots WHERE work_id = ?").all(w.id);
    for (const p of plots) {
        console.log(`  Plot [${p.language}]: ${p.plot_text.substring(0, 200)}...`);
    }
    
    // Get enrichment
    const enr = d.prepare("SELECT * FROM enrichments WHERE work_id = ? AND language = 'it'").all(w.id);
    for (const e of enr) {
        console.log(`  Enrichment WHY: ${e.why_text.substring(0, 200)}`);
        console.log(`  Enrichment HOW: ${e.how_text.substring(0, 200)}`);
    }
}

// 2. Check if "adolescente che può vedere fantasmi" is from another work
console.log('\n--- SEARCH: "fantasmi" in plots ---');
const ghostPlots = d.prepare("SELECT p.work_id, w.title_en, w.title_it, w.year, SUBSTR(p.plot_text, 1, 200) as snippet FROM plots p JOIN works w ON w.id = p.work_id WHERE p.plot_text LIKE '%fantasmi%' OR p.plot_text LIKE '%vedere fantasmi%' OR p.plot_text LIKE '%ghost%see ghost%'").all();
for (const g of ghostPlots) {
    console.log(`  id=${g.work_id} "${g.title_en}" (${g.year}): ${g.snippet.substring(0, 150)}`);
}

console.log('\n--- SEARCH: "adolescente" + "fantasmi" in enrichments ---');
const ghostEnrich = d.prepare("SELECT e.work_id, w.title_en, w.title_it, e.why_text FROM enrichments e JOIN works w ON w.id = e.work_id WHERE e.why_text LIKE '%fantasmi%' OR e.why_text LIKE '%vedere fantasmi%'").all();
for (const g of ghostEnrich) {
    console.log(`  id=${g.work_id} "${g.title_en}": ${g.why_text.substring(0, 200)}`);
}

// 3. Check for duplicate work_ids in plots table
console.log('\n--- CHECK: Works with multiple plots in same language ---');
const dupes = d.prepare("SELECT work_id, language, COUNT(*) as cnt FROM plots GROUP BY work_id, language HAVING cnt > 1 LIMIT 20").all();
console.log(`  Found ${dupes.length} duplicate plot entries`);
for (const dup of dupes.slice(0, 5)) {
    const w = d.prepare("SELECT title_en FROM works WHERE id = ?").get(dup.work_id);
    console.log(`  id=${dup.work_id} "${w?.title_en}" lang=${dup.language} count=${dup.cnt}`);
}

// 4. Check if enrichment WHY matches its own plot or someone else's
// Sample 20 popular works and cross-check
console.log('\n--- CROSS-CHECK: Enrichment vs Plot consistency (top 50 by sitelinks) ---');
const topWorks = d.prepare(`
    SELECT w.id, w.title_en, w.title_it, w.sitelinks, e.why_text,
           (SELECT SUBSTR(p.plot_text, 1, 300) FROM plots p WHERE p.work_id = w.id LIMIT 1) as plot_snippet
    FROM works w
    JOIN enrichments e ON e.work_id = w.id AND e.language = 'it'
    WHERE w.sitelinks >= 60
    ORDER BY w.sitelinks DESC
    LIMIT 50
`).all();

let suspicious = 0;
for (const tw of topWorks) {
    // Check if the enrichment mentions characters/elements NOT in the plot
    // Simple heuristic: extract proper nouns from WHY and check if they appear in plot
    const whyText = tw.why_text || '';
    const plotSnippet = tw.plot_snippet || '';
    
    // Flag: if enrichment is a template (generic), skip
    if (whyText.includes('affronta temi di') || whyText.includes('esplora temi di')) continue;
    
    // Flag: if enrichment is very short, suspicious
    if (whyText.length < 40) {
        console.log(`  [SHORT] id=${tw.id} "${tw.title_en}" WHY only ${whyText.length} chars`);
        suspicious++;
        continue;
    }
    
    // Show first few for manual inspection
    if (suspicious === 0 && tw.sitelinks >= 80) {
        console.log(`  [OK?] id=${tw.id} "${tw.title_en}" (sl=${tw.sitelinks})`);
        console.log(`    WHY: ${whyText.substring(0, 120)}`);
        console.log(`    PLOT: ${plotSnippet.substring(0, 120)}`);
    }
}
console.log(`  Total suspicious (short WHY): ${suspicious}`);

// 5. Specific: check The Beach's plot_text vs enrichment for content mismatch
console.log('\n--- THE BEACH: Full plot text ---');
const beachPlots = d.prepare("SELECT * FROM plots WHERE work_id IN (SELECT id FROM works WHERE title_en = 'The Beach' AND year = 2000)").all();
for (const bp of beachPlots) {
    console.log(`  [${bp.language}] Full plot (${bp.plot_text.length} chars): ${bp.plot_text.substring(0, 500)}`);
}

db.close();
