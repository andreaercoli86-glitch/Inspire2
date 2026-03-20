/**
 * Reset vector table and enrichments for new embedding model.
 * Keeps works, plots, and FTS5 intact.
 */
'use strict';
const db = require('../db');

const d = db.getDb(); // This calls ensureSchema()

// Drop old vec_works (768-dim nomic) — will be recreated with 2560-dim
try { d.exec('DROP TABLE IF EXISTS vec_works'); console.log('Dropped vec_works (old nomic 768-dim)'); } catch(e) { console.log('vec_works:', e.message); }

// Clear enrichments
try { d.exec('DELETE FROM enrichments'); console.log('Cleared enrichments'); } catch(e) { console.log('enrichments:', e.message); }

// Recreate vec_works with new dimension (2560 for qwen3-embedding:4b)
try {
    d.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_works USING vec0(
        work_id INTEGER PRIMARY KEY,
        embedding FLOAT[2560]
    )`);
    console.log('Created vec_works with 2560-dim');
} catch(e) { console.log('vec_works create:', e.message); }

// Show stats
const works = d.prepare('SELECT COUNT(*) as cnt FROM works').get().cnt;
const plots = d.prepare('SELECT COUNT(DISTINCT work_id) as cnt FROM plots').get().cnt;
console.log(`\nData intact: ${works} works, ${plots} with plots`);

db.close();
