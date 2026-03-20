const db = require('../db');
const d = db.getDb();

const total = d.prepare("SELECT COUNT(DISTINCT w.id) as c FROM works w INNER JOIN plots p ON w.id = p.work_id").get();
const enr = d.prepare("SELECT COUNT(*) as c FROM enrichments WHERE language = 'it'").get();
const llmGood = d.prepare("SELECT COUNT(*) as c FROM enrichments WHERE language = 'it' AND why_text NOT LIKE '%affronta temi di%' AND why_text NOT LIKE '%esplora temi di%'").get();
const tmpl = enr.c - llmGood.c;

// Check The Beach specifically
const beach = d.prepare("SELECT e.why_text FROM enrichments e JOIN works w ON e.work_id = w.id WHERE w.title_en = 'The Beach' AND e.language = 'it'").get();

console.log("=== ENRICHMENT STATUS ===");
console.log("Works with plots: " + total.c);
console.log("Total enrichments (it): " + enr.c);
console.log("LLM enrichments (good): " + llmGood.c);
console.log("Template/generic: " + tmpl);
console.log("");
if (beach) {
    console.log("The Beach WHY: " + beach.why_text.substring(0, 120));
} else {
    console.log("The Beach: NO enrichment");
}

db.close();
