'use strict';
const db = require('../db');
const d = db.getDb();

console.log('=== FIX DUPLICATE PLOTS ===\n');

// Strategy: For each (work_id, language) pair with duplicates,
// KEEP the longest plot (most complete) and DELETE the rest.
// Also delete the enrichment for that work so it gets regenerated.

// 1. Find all duplicates
const dupes = d.prepare(`
    SELECT work_id, language, COUNT(*) as cnt 
    FROM plots 
    GROUP BY work_id, language 
    HAVING cnt > 1
`).all();

console.log(`Found ${dupes.length} (work_id, language) pairs with duplicate plots\n`);

// Prepare statements
const getPlots = d.prepare(`
    SELECT rowid, work_id, language, LENGTH(plot_text) as len, SUBSTR(plot_text, 1, 80) as preview
    FROM plots 
    WHERE work_id = ? AND language = ?
    ORDER BY LENGTH(plot_text) DESC
`);

const deletePlot = d.prepare(`DELETE FROM plots WHERE rowid = ?`);
const deleteEnrichment = d.prepare(`DELETE FROM enrichments WHERE work_id = ? AND language = 'it'`);

let totalDeleted = 0;
let enrichmentsCleared = 0;

// Use a transaction for atomicity
const fixAll = d.transaction(() => {
    for (const dup of dupes) {
        const plots = getPlots.all(dup.work_id, dup.language);
        const w = d.prepare("SELECT title_en, title_it, sitelinks FROM works WHERE id = ?").get(dup.work_id);
        
        // Keep the first (longest), delete the rest
        const kept = plots[0];
        const toDelete = plots.slice(1);
        
        console.log(`id=${dup.work_id} "${w?.title_en}" [${dup.language}]: keeping ${kept.len}ch, deleting ${toDelete.length} shorter plots`);
        
        for (const td of toDelete) {
            deletePlot.run(td.rowid);
            totalDeleted++;
        }
        
        // Clear enrichment so it gets regenerated with correct plot
        const delResult = deleteEnrichment.run(dup.work_id);
        if (delResult.changes > 0) enrichmentsCleared++;
    }
});

fixAll();

// 2. Verify
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

// 3. Count current enrichment state
const enrCount = d.prepare("SELECT COUNT(*) as c FROM enrichments WHERE language = 'it'").get();
console.log(`Total enrichments remaining: ${enrCount.c}`);

db.close();
