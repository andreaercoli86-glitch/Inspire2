const db = require('./db');
db.getDb();
const d = db.getDb();

const missing = d.prepare(`
    SELECT w.type, COUNT(*) as cnt 
    FROM works w 
    LEFT JOIN plots p ON p.work_id = w.id 
    WHERE p.id IS NULL 
    GROUP BY w.type
`).all();
console.log('Missing plots by type:', JSON.stringify(missing));

const total = d.prepare(`SELECT type, COUNT(*) as cnt FROM works GROUP BY type`).all();
console.log('Total by type:', JSON.stringify(total));

const withPlots = d.prepare(`
    SELECT w.type, COUNT(DISTINCT w.id) as cnt 
    FROM works w 
    JOIN plots p ON p.work_id = w.id 
    GROUP BY w.type
`).all();
console.log('With plots by type:', JSON.stringify(withPlots));

// Sample some missing titles
const missingTitles = d.prepare(`
    SELECT w.title_en, w.title_it, w.type, w.year, w.sitelinks
    FROM works w
    LEFT JOIN plots p ON p.work_id = w.id
    WHERE p.id IS NULL
    ORDER BY w.sitelinks DESC
    LIMIT 20
`).all();
console.log('\nTop 20 missing (by popularity):');
for (const m of missingTitles) {
    console.log(`  [${m.type}] ${m.title_en || m.title_it} (${m.year}) sitelinks=${m.sitelinks}`);
}
db.close();
