const db = require('./db');
const d = db.getDb();

// List all tables
const tables = d.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','virtual') ORDER BY name").all();
console.log("Tables:", tables.map(t => t.name + " (" + t.type + ")").join(", "));

// Try to check vec_works
try {
    const count = d.prepare("SELECT COUNT(*) as c FROM vec_works").get();
    console.log("vec_works count:", count.c);
} catch(e) {
    console.log("vec_works error:", e.message);
}

// Try to insert a test embedding
try {
    const testVec = new Float32Array(768);
    for (let i = 0; i < 768; i++) testVec[i] = Math.random();
    db.insertEmbedding(1, testVec);
    console.log("Test insert: SUCCESS");
    // Clean up
    d.prepare("DELETE FROM vec_works WHERE work_id = 1").run();
} catch(e) {
    console.log("Test insert error:", e.message);
    console.log("Stack:", e.stack);
}

db.close();
