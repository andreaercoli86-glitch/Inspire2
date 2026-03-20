'use strict';
const db = require('../db');
const d = db.getDb();

// Count current state
const total = d.prepare("SELECT COUNT(*) as c FROM enrichments WHERE language = 'it'").get();
console.log('Total enrichments:', total.c);

// Template enrichments are those with generic "affronta temi di" / "esplora temi di" / starts with title
const templateCount = d.prepare(`
    SELECT COUNT(*) as c FROM enrichments 
    WHERE language = 'it' 
    AND (why_text LIKE '%affronta temi di%' 
         OR why_text LIKE '%esplora temi di%'
         OR why_text LIKE '%Questo film%'
         OR why_text LIKE '%Questo libro%')
`).get();
console.log('Template/generic enrichments to delete:', templateCount.c);

// Delete template enrichments — keep LLM-generated ones
const result = d.prepare(`
    DELETE FROM enrichments 
    WHERE language = 'it' 
    AND (why_text LIKE '%affronta temi di%' 
         OR why_text LIKE '%esplora temi di%'
         OR why_text LIKE '%Questo film%'
         OR why_text LIKE '%Questo libro%')
`).run();
console.log('Deleted:', result.changes);

// Count remaining
const remaining = d.prepare("SELECT COUNT(*) as c FROM enrichments WHERE language = 'it'").get();
console.log('Remaining (good LLM enrichments):', remaining.c);

db.close();
