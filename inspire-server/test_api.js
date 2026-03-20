async function test() {
    // Test 1: Search API
    console.log("=== Test 1: /api/search ===");
    try {
        const res = await fetch("http://localhost:3456/api/search", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({query: "romanzo di avventura con pirati", limit: 5})
        });
        const data = await res.json();
        console.log("Status:", res.status);
        console.log("Results:", data.results.length);
        data.results.forEach((r, i) => {
            console.log("  " + (i+1) + ". [" + r.badge + "] " + (r.title_it || r.title_en) + " (" + r.creator + ", " + r.year + ") score=" + (r._confidence||0).toFixed(3));
        });
        console.log("Timing:", JSON.stringify(data.timing));
    } catch(e) {
        console.log("Error:", e.message);
    }

    // Test 2: Stats API
    console.log("\n=== Test 2: /api/stats ===");
    try {
        const res = await fetch("http://localhost:3456/api/stats");
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    } catch(e) {
        console.log("Error:", e.message);
    }

    // Test 3: Another search
    console.log("\n=== Test 3: sci-fi movie search ===");
    try {
        const res = await fetch("http://localhost:3456/api/search", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({query: "film di fantascienza con viaggi nel tempo", type: "movie", limit: 5})
        });
        const data = await res.json();
        data.results.forEach((r, i) => {
            console.log("  " + (i+1) + ". [" + r.badge + "] " + (r.title_it || r.title_en) + " (" + r.creator + ", " + r.year + ")");
        });
    } catch(e) {
        console.log("Error:", e.message);
    }
}
test();
