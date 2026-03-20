const Database = require('better-sqlite3');
const sqliteVec = require('sqlite-vec');
const db = new Database(':memory:');
sqliteVec.load(db);
const ver = db.prepare('SELECT sqlite_version() as v, vec_version() as vv').get();
console.log('SQLite:', ver.v, '| sqlite-vec:', ver.vv);
console.log('OK: Native modules work!');
db.close();
