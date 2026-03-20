const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'inspire.db');
const db = new Database(dbPath, { readonly: true });
const cnt = db.prepare('SELECT COUNT(*) as cnt FROM enrichments').get().cnt;
console.log('Enrichments: ' + cnt);
db.close();
