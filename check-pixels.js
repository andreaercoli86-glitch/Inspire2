const db = require('./db');
db.getDb();
const d = db.getDb();

// Find Pixels
const pixels = d.prepare(`SELECT w.*, p.plot_text, p.plot_short, p.source, p.match_confidence 
    FROM works w 
    LEFT JOIN plots p ON p.work_id = w.id 
    WHERE w.title_en LIKE '%Pixels%' AND w.type = 'movie'`).all();

for (const p of pixels) {
    console.log(`\n=== ${p.title_en} (${p.year}) ===`);
    console.log(`  Type: ${p.type}, Creator: ${p.creator}`);
    console.log(`  Sitelinks: ${p.sitelinks}, Popularity: ${p.popularity}`);
    console.log(`  Plot source: ${p.source}, confidence: ${p.match_confidence}`);
    console.log(`  Plot: ${(p.plot_text || 'NONE').substring(0, 500)}`);
}
db.close();
