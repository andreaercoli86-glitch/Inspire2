const db = require('./db');
const search = require('./search');

async function test() {
    // Test search directly through search module
    console.log("=== Direct search module test ===");
    try {
        const result = await search.search({query: "adventure novel with pirates", limit: 10});
        console.log("Results:", result.results.length, "total_found:", result.total_found, "time:", result.search_time_ms + "ms");
        result.results.forEach((r, i) => {
            console.log("  " + (i+1) + ". [" + r.badge + " conf=" + r.confidence + " sim=" + r.similarity + "] " + (r.title_it||r.title_en));
        });
    } catch(e) {
        console.log("Error:", e.message);
        console.log("Stack:", e.stack);
    }

    // Test vectorSearch directly
    console.log("\n=== Direct vectorSearch test ===");
    try {
        const vec = await search.getEmbedding("horror movie with ghosts");
        console.log("Got embedding, length:", vec.length);
        const results = db.vectorSearch(vec, {limit: 10});
        console.log("vectorSearch results:", results.length);
        results.forEach((r, i) => {
            console.log("  " + (i+1) + ". sim=" + (r.similarity||0).toFixed(4) + " " + (r.title_it||r.title_en));
        });
    } catch(e) {
        console.log("Error:", e.message);
        console.log("Stack:", e.stack);
    }

    db.close();
}
test();
