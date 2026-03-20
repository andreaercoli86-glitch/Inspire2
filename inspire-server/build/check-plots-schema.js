'use strict';
const db = require('../db');
const d = db.getDb();

// Check table schema
const schema = d.prepare("SELECT sql FROM sqlite_master WHERE name = 'plots'").get();
console.log('Plots table schema:', schema?.sql);

// Check if rowid works
const sample = d.prepare("SELECT rowid, work_id, language, LENGTH(plot_text) as len FROM plots LIMIT 5").all();
console.log('\nSample rows with rowid:');
for (const s of sample) {
    console.log(`  rowid=${s.rowid} work_id=${s.work_id} lang=${s.language} len=${s.len}`);
}

// Check The Beach specifically
const beach = d.prepare("SELECT rowid, work_id, language, LENGTH(plot_text) as len, SUBSTR(plot_text, 1, 50) as preview FROM plots WHERE work_id = 5276").all();
console.log('\nThe Beach plots after fix:');
for (const b of beach) {
    console.log(`  rowid=${b.rowid} [${b.language}] ${b.len}ch: "${b.preview}"`);
}

// Count remaining dupes
const dupes = d.prepare("SELECT work_id, language, COUNT(*) as cnt FROM plots GROUP BY work_id, language HAVING cnt > 1").all();
console.log(`\nRemaining duplicates: ${dupes.length}`);
if (dupes.length > 0) {
    console.log('First 3 examples:');
    for (const dup of dupes.slice(0, 3)) {
        const rows = d.prepare("SELECT rowid, LENGTH(plot_text) as len FROM plots WHERE work_id = ? AND language = ?").all(dup.work_id, dup.language);
        console.log(`  id=${dup.work_id} [${dup.language}] cnt=${dup.cnt} rowids: ${rows.map(r => r.rowid + '(' + r.len + 'ch)').join(', ')}`);
    }
}

db.close();
