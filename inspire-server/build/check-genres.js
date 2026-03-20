'use strict';
const db = require('../db');
const d = db.getDb();

// All unique genres
const rows = d.prepare(`SELECT genres FROM works WHERE type='movie' AND genres IS NOT NULL AND genres != '[]'`).all();
const allGenres = new Set();
for (const r of rows) {
    try {
        const arr = JSON.parse(r.genres);
        arr.forEach(g => allGenres.add(g));
    } catch {}
}
console.log('=== ALL UNIQUE GENRES ===');
console.log([...allGenres].sort().join('\n'));

// Check Toy Story, Frozen, etc by title
console.log('\n=== DISNEY/PIXAR by TITLE ===');
const titles = ['Toy Story', 'Frozen', 'Coco', 'Up', 'Inside Out', 'Ratatouille', 'Il re leone', 'Aladdin', 'La sirenetta', 'Biancaneve'];
for (const t of titles) {
    const r = d.prepare(`SELECT title_it, title_en, year, creator, genres, sitelinks FROM works WHERE (title_it LIKE ? OR title_en LIKE ?) AND type='movie' LIMIT 3`).all(`%${t}%`, `%${t}%`);
    r.forEach(w => console.log(`${w.title_it || w.title_en} | ${w.year} | ${w.creator} | genres=${w.genres} | links=${w.sitelinks}`));
}

// Check animated films by looking at genres containing 'anim'
console.log('\n=== FILMS WITH ANIM IN GENRES ===');
const anim = d.prepare(`SELECT title_it, title_en, year, creator, genres, sitelinks FROM works WHERE type='movie' AND genres LIKE '%anim%' ORDER BY sitelinks DESC LIMIT 10`).all();
anim.forEach(r => console.log(`${r.title_it || r.title_en} | ${r.year} | ${r.creator} | ${r.genres}`));
console.log(`Count: ${anim.length}`);

db.close();
