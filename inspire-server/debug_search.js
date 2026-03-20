const db = require('./db');
const d = db.getDb();

async function test() {
    // 1. Generate embedding for a query
    const res = await fetch("http://localhost:11434/api/embed", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({model: "nomic-embed-text-v2-moe", input: "adventure novel with pirates"})
    });
    const data = await res.json();
    const vec = data.embeddings[0];
    console.log("Query vec length:", vec.length, "sample:", vec.slice(0,5));

    // 2. Raw vector search
    const vecBuf = Buffer.from(new Float32Array(vec).buffer);
    console.log("Buffer size:", vecBuf.length);

    try {
        const results = d.prepare("SELECT work_id, distance FROM vec_works WHERE embedding MATCH ? ORDER BY distance LIMIT 10").all(vecBuf);
        console.log("\nRaw vec results:", results.length);
        results.forEach((r, i) => {
            const work = d.prepare("SELECT title_it, title_en, type, sitelinks FROM works WHERE id = ?").get(r.work_id);
            const sim = Math.max(0, 1 - (r.distance * r.distance / 2));
            console.log("  " + (i+1) + ". dist=" + r.distance.toFixed(4) + " sim=" + sim.toFixed(4) + " [" + work.type + "] " + (work.title_it||work.title_en) + " (sl=" + work.sitelinks + ")");
        });
    } catch(e) {
        console.log("Vec search error:", e.message);
        console.log("Stack:", e.stack);
    }

    // 3. Check a stored embedding
    try {
        const sample = d.prepare("SELECT work_id, length(embedding) as len FROM vec_works LIMIT 3").all();
        console.log("\nStored embeddings sample:", JSON.stringify(sample));
    } catch(e) {
        console.log("Sample error:", e.message);
    }

    db.close();
}
test();
