'use strict';
const db = require('../db');
const d = db.getDb();

// 1. Full count of duplicate plots
const allDupes = d.prepare(`
    SELECT work_id, language, COUNT(*) as cnt 
    FROM plots 
    GROUP BY work_id, language 
    HAVING cnt > 1
`).all();
console.log(`Total works with duplicate plots in same language: ${allDupes.length}`);

// 2. Detail all duplicates
console.log('\n=== ALL DUPLICATE PLOT ENTRIES ===');
for (const dup of allDupes) {
    const w = d.prepare("SELECT title_en, title_it, sitelinks FROM works WHERE id = ?").get(dup.work_id);
    const plots = d.prepare("SELECT ROWID, language, LENGTH(plot_text) as len, SUBSTR(plot_text, 1, 80) as preview FROM plots WHERE work_id = ? AND language = ?").all(dup.work_id, dup.language);
    
    console.log(`\n  id=${dup.work_id} "${w?.title_en}" (sl=${w?.sitelinks}) — ${dup.cnt} plots in [${dup.language}]:`);
    for (const p of plots) {
        console.log(`    rowid=${p.ROWID} [${p.language}] ${p.len} chars: "${p.preview}..."`);
    }
}

// 3. Check: how does generate-enrichments.js read plots?
// It does: INNER JOIN plots p ON w.id = p.work_id, then groups by work_id
// With duplicates, SQLite returns arbitrary row for non-aggregated columns
// This means the LLM may see the WRONG plot!

// 4. Count works where enrichment was generated with wrong plot
console.log('\n=== ENRICHMENTS POTENTIALLY CORRUPTED ===');
let corruptCount = 0;
for (const dup of allDupes) {
    const enr = d.prepare("SELECT why_text FROM enrichments WHERE work_id = ? AND language = 'it'").get(dup.work_id);
    if (!enr) continue;
    
    const w = d.prepare("SELECT title_en, title_it FROM works WHERE id = ?").get(dup.work_id);
    const plots = d.prepare("SELECT SUBSTR(plot_text, 1, 100) as preview, LENGTH(plot_text) as len FROM plots WHERE work_id = ? AND language = ?").all(dup.work_id, dup.language);
    
    // Show enrichment vs plots for manual inspection
    console.log(`\n  id=${dup.work_id} "${w?.title_en}":`);
    console.log(`    WHY: ${enr.why_text.substring(0, 150)}`);
    for (const p of plots) {
        console.log(`    PLOT(${p.len}ch): ${p.preview}`);
    }
    corruptCount++;
}
console.log(`\nTotal works with dupes AND enrichment: ${corruptCount}`);

// 5. Check the broader issue: are there works where title suggests a DIFFERENT work?
// e.g., "The Beach" having Bleach's plot
console.log('\n=== SPOT CHECK: Plot text first word vs title mismatch ===');
const suspicious = d.prepare(`
    SELECT w.id, w.title_en, w.sitelinks, SUBSTR(p.plot_text, 1, 150) as preview
    FROM works w
    JOIN plots p ON p.work_id = w.id
    WHERE w.sitelinks >= 40
    ORDER BY w.sitelinks DESC
    LIMIT 500
`).all();

// Group by work_id, check if any work has plots that mention a completely different title
const seen = new Set();
let mismatchCount = 0;
for (const s of suspicious) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    
    // Simple check: does the preview mention "Ichigo" for a non-Bleach movie?
    // Or other obvious mismatches
    const preview = s.preview.toLowerCase();
    const title = s.title_en.toLowerCase();
    
    // Check for anime character names in non-anime titles
    const animeNames = ['ichigo', 'naruto', 'goku', 'luffy'];
    for (const name of animeNames) {
        if (preview.includes(name) && !title.includes(name) && !title.toLowerCase().includes('bleach')) {
            console.log(`  [MISMATCH] id=${s.id} "${s.title_en}" has "${name}" in plot`);
            mismatchCount++;
        }
    }
}
console.log(`Anime name mismatches found: ${mismatchCount}`);

db.close();
