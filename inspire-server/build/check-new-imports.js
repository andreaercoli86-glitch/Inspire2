'use strict';
const db = require('../db');
const d = db.getDb();
const schema = d.prepare("SELECT sql FROM sqlite_master WHERE name='enrichments'").get();
console.log(schema.sql);
db.close();
