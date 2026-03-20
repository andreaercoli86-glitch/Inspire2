'use strict';
const db = require('../db');
console.log('Rebuilding FTS5 index...');
db.rebuildFtsIndex();
console.log('FTS5 index rebuilt successfully.');
db.close();
