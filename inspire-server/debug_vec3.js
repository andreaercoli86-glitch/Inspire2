const db = require('./db');
const d = db.getDb();

const testVec = new Float32Array(768);
for (let i = 0; i < 768; i++) testVec[i] = Math.random();
const buf = Buffer.from(testVec.buffer);

// Try different approaches
console.log("Test 1: Integer literal in SQL");
try {
    d.exec("INSERT INTO vec_works (work_id, embedding) VALUES (1, X'" + buf.toString('hex') + "')");
    console.log("  SUCCESS via hex literal!");
    d.exec("DELETE FROM vec_works WHERE work_id = 1");
} catch(e) {
    console.log("  Error:", e.message);
}

console.log("Test 2: Using integer() wrapper");
try {
    d.prepare("INSERT INTO vec_works (work_id, embedding) VALUES (CAST(? AS INTEGER), ?)").run(1, buf);
    console.log("  SUCCESS via CAST!");
    d.exec("DELETE FROM vec_works WHERE work_id = 1");
} catch(e) {
    console.log("  Error:", e.message);
}

console.log("Test 3: Using BigInt");
try {
    d.prepare("INSERT INTO vec_works (work_id, embedding) VALUES (?, ?)").run(BigInt(1), buf);
    console.log("  SUCCESS via BigInt!");
    d.exec("DELETE FROM vec_works WHERE work_id = 1");
} catch(e) {
    console.log("  Error:", e.message);
}

console.log("Test 4: Using vec_f32");
try {
    d.prepare("INSERT INTO vec_works (work_id, embedding) VALUES (?, vec_f32(?))").run(1, buf);
    console.log("  SUCCESS via vec_f32!");
    d.exec("DELETE FROM vec_works WHERE work_id = 1");
} catch(e) {
    console.log("  Error:", e.message);
}

console.log("Test 5: rowid instead of work_id");
try {
    d.prepare("INSERT INTO vec_works (rowid, embedding) VALUES (?, ?)").run(1, buf);
    console.log("  SUCCESS via rowid!");
    d.exec("DELETE FROM vec_works WHERE rowid = 1");
} catch(e) {
    console.log("  Error:", e.message);
}

db.close();
