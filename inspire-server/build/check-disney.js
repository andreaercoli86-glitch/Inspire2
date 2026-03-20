'use strict';
const db = require('../db');
const d = db.getDb();

const classics = [
    'Toy Story', 'Frozen', 'Lion King', 'Aladdin', 'Bambi', 'Pinocchio',
    'Dumbo', 'Cinderella', 'Snow White', 'Finding Nemo', 'Monsters, Inc',
    'Cars', 'WALL-E', 'Ratatouille', 'Inside Out', 'Coco', 'Moana',
    'Tangled', 'Brave', 'Encanto', 'Luca', 'Soul', 'Turning Red',
    'Elemental', 'Wish', 'Zootopia', 'Big Hero 6', 'Wreck-It Ralph',
    'The Incredibles', 'Beauty and the Beast', 'Mulan', 'Pocahontas',
    'Tarzan', 'Hercules', 'The Little Mermaid', 'Peter Pan', 'Sleeping Beauty',
    'The Jungle Book', 'Robin Hood', 'Fantasia',
    'Alice in Wonderland', '101 Dalmatians', 'Bolt',
    'Lightyear', 'Onward', 'Monsters University', 'The Good Dinosaur'
];

let found = 0, missing = 0, withPlot = 0, noPlot = 0;
const missingList = [];

for (const t of classics) {
    const rows = d.prepare("SELECT id, title_it, title_en, year, creator, genres, sitelinks FROM works WHERE (title_en LIKE ? OR title_it LIKE ?) AND type='movie' ORDER BY sitelinks DESC LIMIT 2").all('%' + t + '%', '%' + t + '%');

    if (rows.length) {
        const r = rows[0];
        const plots = d.prepare("SELECT language, LENGTH(plot_text) as len FROM plots WHERE work_id = ?").all(r.id);
        const plotInfo = plots.map(p => p.language + ':' + p.len).join(', ') || 'NO PLOT';
        const hasPlot = plots.length > 0;
        console.log('OK   ' + (r.title_en || r.title_it || '').substring(0, 35).padEnd(36) + ' ' + (r.year || '').toString().padEnd(6) + ' plots=[' + plotInfo + ']');
        found++;
        if (hasPlot) withPlot++; else { noPlot++; missingList.push(t + ' (no plot)'); }
    } else {
        console.log('MISS ' + t);
        missing++;
        missingList.push(t);
    }
}

console.log('\n=== SUMMARY ===');
console.log('Found: ' + found + ', Missing: ' + missing + ', With plot: ' + withPlot + ', No plot: ' + noPlot);
if (missingList.length) {
    console.log('\nMISSING/NO PLOT:');
    missingList.forEach(m => console.log('  - ' + m));
}

db.close();
