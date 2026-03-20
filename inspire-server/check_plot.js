const db = require('./db');
const d = db.getDb();
try {
    const t = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='enrichments'").get();
    console.log('enrichments table: ' + (t ? 'EXISTS' : 'NOT EXISTS'));
} catch(e) { console.log('Error: ' + e.message); }
// Also check FTS5 table
try {
    const t2 = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='search_text'").get();
    console.log('search_text FTS5: ' + (t2 ? 'EXISTS' : 'NOT EXISTS'));
    if (t2) {
        const cnt = d.prepare("SELECT COUNT(*) as c FROM search_text").get().c;
        console.log('  FTS5 rows: ' + cnt);
    }
} catch(e) { console.log('FTS5 Error: ' + e.message); }
process.exit(0);
