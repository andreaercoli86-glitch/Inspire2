'use strict';
const db = require('../db');
db.getDb().exec('DELETE FROM enrichments');
console.log('Enrichments cleared');
db.close();
