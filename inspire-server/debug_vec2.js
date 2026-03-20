const db = require('./db');
const d = db.getDb();

// Check type of work IDs
const first = d.prepare("SELECT id, typeof(id) as t FROM works LIMIT 3").all();
console.log("Work IDs:", JSON.stringify(first));

// Try direct SQL insert instead of using db.insertEmbedding
try {
    const testVec = new Float32Array(768);
    for (let i = 0; i < 768; i++) testVec[i] = Math.random();
    const buf = Buffer.from(testVec.buffer);
    console.log("Buffer length:", buf.length, "expected:", 768*4);
    
    // Direct insert
    const stmt = d.prepare("INSERT INTO vec_works (work_id, embedding) VALUES (?, ?)");
    stmt.run(1, buf);
    console.log("Direct insert: SUCCESS");
    d.prepare("DELETE FROM vec_works WHERE work_id = 1").run();
} catch(e) {
    console.log("Direct insert error:", e.message);
}

// Check if maybe works.id starts at 0 or is null
const nullIds = d.prepare("SELECT COUNT(*) as c FROM works WHERE id IS NULL").get();
console.log("Null IDs:", nullIds.c);
const minMax = d.prepare("SELECT MIN(id) as mn, MAX(id) as mx FROM works").get();
console.log("Min ID:", minMax.mn, "Max ID:", minMax.mx);

db.close();
