'use strict';
const db = require('../db');
const d = db.getDb();

const titles = [
    'A Beautiful Mind',
    'The Theory of Everything',
    'Oppenheimer',
    'The Imitation Game',
    'Hidden Figures',
    'Good Will Hunting',
    'Einstein',
    'Genius'
];

console.log('=== Checking scientist films in DB ===\n');

for (const title of titles) {
    const works = d.prepare(`
        SELECT w.id, w.title_en, w.title_it, w.year, w.sitelinks, w.creator,
            (SELECT COUNT(*) FROM plots p WHERE p.work_id = w.id) as plot_count
        FROM works w
        WHERE w.title_en LIKE ? OR w.title_it LIKE ?
        ORDER BY w.sitelinks DESC
    `).all(`%${title}%`, `%${title}%`);

    if (works.length === 0) {
        console.log(`❌ "${title}" — NOT FOUND in DB`);
    } else {
        for (const w of works) {
            // Check if has embedding in vec_works
            let hasEmb = '?';
            try {
                // Can't easily query vec_works, so check enrichments instead
                const enr = d.prepare('SELECT work_id FROM enrichments WHERE work_id = ?').get(w.id);
                hasEmb = enr ? 'YES' : 'NO';
            } catch(e) { hasEmb = 'err'; }

            console.log(`✓ "${title}" → id=${w.id} | "${w.title_en}" (${w.year}) | sitelinks=${w.sitelinks} | plots=${w.plot_count} | enriched=${hasEmb} | creator=${w.creator}`);
        }
    }
    console.log('');
}

// Also check what the actual search results were — look at confidence scores
console.log('=== Checking Theory of Everything specifically ===');
const tot = d.prepare("SELECT w.id, w.title_en, w.title_it, w.sitelinks, w.genres FROM works w WHERE w.title_en LIKE '%Theory of Everything%'").all();
tot.forEach(r => console.log(JSON.stringify(r)));

db.close();
