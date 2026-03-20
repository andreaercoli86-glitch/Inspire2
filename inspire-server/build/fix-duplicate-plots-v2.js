'use strict';
const db = require('../db');
const d = db.getDb();

console.log('=== FIX DUPLICATE PLOTS (v2 — using id column) ===\n');

// Find all duplicates
const dupes = d.prepare(`
    SELECT work_id, language, COUNT(*) as cnt 
    FROM plots 
    GROUP BY work_id, language 
    HAVING cnt > 1
`).all();

console.log(`Found ${dupes.length} (work_id, language) pairs with duplicate plots\n`);

const getPlots = d.prepare(`
    SELECT id, work_id, language, LENGTH(plot_text) as len, SUBSTR(plot_text, 1, 80) as preview
    FROM plots 
    WHERE work_id = ? AND language = ?
    ORDER BY LENGTH(plot_text) DESC
`);

const deletePlot = d.prepare(`DELETE FROM plots WHERE id = ?`);
const deleteEnrichment = d.prepare(`DELETE FROM enrichments WHERE work_id = ? AND language = 'it'`);

let totalDeleted = 0;
let enrichmentsCleared = 0;

const fixAll = d.transaction(() => {
    for (const dup of dupes) {
        const plots = getPlots.all(dup.work_id, dup.language);
        const w = d.prepare("SELECT title_en, sitelinks FROM works WHERE id = ?").get(dup.work_id);
        
        // Keep the first (longest), delete the rest
        const kept = plots[0];
        const toDelete = plots.slice(1);
        
        console.log(`id=${dup.work_id} "${w?.title_en}" [${dup.language}]: keep plot#${kept.id}(${kept.len}ch), delete ${toDelete.map(t => '#'+t.id+'('+t.len+'ch)').join(', ')}`);
        
        for (const td of toDelete) {
            deletePlot.run(td.id);
            totalDeleted++;
        }
        
        // Clear enrichment for regeneration
        const delResult = deleteEnrichment.run(dup.work_id);
        if (delResult.changes > 0) enrichmentsCleared++;
    }
});

fixAll();

// Verify
const remaining = d.prepare(`
    SELECT work_id, language, COUNT(*) as cnt 
    FROM plots 
    GROUP BY work_id, language 
    HAVING cnt > 1
`).all();

console.log(`\n=== RESULTS ===`);
console.log(`Duplicate plots deleted: ${totalDeleted}`);
console.log(`Enrichments cleared (for regeneration): ${enrichmentsCleared}`);
console.log(`Remaining duplicates: ${remaining.length}`);

// Verify The Beach
const beach = d.prepare("SELECT id, language, LENGTH(plot_text) as len, SUBSTR(plot_text, 1, 80) as preview FROM plots WHERE work_id = 5276").all();
console.log(`\nThe Beach plots after fix:`);
for (const b of beach) {
    console.log(`  plot#${b.id} [${b.language}] ${b.len}ch: "${b.preview}"`);
}

const enrCount = d.prepare("SELECT COUNT(*) as c FROM enrichments WHERE language = 'it'").get();
console.log(`\nTotal enrichments remaining: ${enrCount.c}`);

db.close();
