'use strict';
const db = require('../db');
const d = db.getDb();

// Check Disney/Pixar
console.log('=== DISNEY/PIXAR ===');
const disney = d.prepare(`SELECT title_it, title_en, year, creator, sitelinks FROM works WHERE type='movie' AND (creator LIKE '%Disney%' OR creator LIKE '%Pixar%') ORDER BY sitelinks DESC LIMIT 15`).all();
disney.forEach(r => console.log(`${r.title_it || r.title_en} | ${r.year} | ${r.creator} | links=${r.sitelinks}`));
console.log(`Total Disney/Pixar: ${disney.length}`);

// Check board game related films
console.log('\n=== BOARD GAME / GIOCO TAVOLO ===');
const bg = d.prepare(`SELECT title_it, title_en, year, creator, sitelinks FROM works WHERE type='movie' AND (title_en LIKE '%Jumanji%' OR title_en LIKE '%Zathura%' OR title_en LIKE '%Clue%' OR title_en LIKE '%Game%' OR title_it LIKE '%gioco%') ORDER BY sitelinks DESC LIMIT 15`).all();
bg.forEach(r => console.log(`${r.title_it || r.title_en} | ${r.year} | ${r.creator} | links=${r.sitelinks}`));

// Check how many movies with plots
console.log('\n=== STATS ===');
const stats = d.prepare(`SELECT COUNT(DISTINCT w.id) as cnt FROM works w INNER JOIN plots p ON w.id=p.work_id WHERE w.type='movie'`).get();
console.log(`Movies with plots: ${stats.cnt}`);

const total = d.prepare(`SELECT COUNT(*) as cnt FROM works WHERE type='movie'`).get();
console.log(`Total movies: ${total.cnt}`);

// Check animation genre
console.log('\n=== ANIMATION GENRE ===');
const anim = d.prepare(`SELECT title_it, title_en, year, creator, sitelinks FROM works WHERE type='movie' AND genres LIKE '%animation%' ORDER BY sitelinks DESC LIMIT 15`).all();
anim.forEach(r => console.log(`${r.title_it || r.title_en} | ${r.year} | ${r.creator} | links=${r.sitelinks}`));
console.log(`Total animation: ${anim.length}`);

db.close();
