'use strict';
const db = require('../db');
const d = db.getDb();

const total = d.prepare("SELECT COUNT(DISTINCT w.id) as c FROM works w INNER JOIN plots p ON w.id = p.work_id").get();
const enr = d.prepare("SELECT COUNT(*) as c FROM enrichments WHERE language = 'it'").get();
const llmGood = d.prepare("SELECT COUNT(*) as c FROM enrichments WHERE language = 'it' AND why_text NOT LIKE '%affronta temi di%' AND why_text NOT LIKE '%esplora temi di%'").get();

console.log('Works with plots:', total.c);
console.log('Existing enrichments:', enr.c);
console.log('Good LLM enrichments:', llmGood.c);
console.log('Template/generic:', enr.c - llmGood.c);
db.close();
