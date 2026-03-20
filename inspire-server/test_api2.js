async function test() {
    // Test with lower threshold and no type filter
    console.log("=== Test: sci-fi time travel (no type filter) ===");
    try {
        const res = await fetch("http://localhost:3456/api/search", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({query: "science fiction time travel", limit: 10})
        });
        const data = await res.json();
        console.log("Status:", res.status, "Results:", data.results ? data.results.length : 0);
        if (data.results) {
            data.results.forEach((r, i) => {
                console.log("  " + (i+1) + ". [" + r.type + "] " + (r.title_it || r.title_en) + " (" + (r.creator||"?") + ", " + r.year + ") badge=" + r.badge);
            });
        }
        if (data.error) console.log("Error:", data.error);
    } catch(e) {
        console.log("Fetch error:", e.message);
    }

    console.log("\n=== Test: classic Italian literature ===");
    try {
        const res = await fetch("http://localhost:3456/api/search", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({query: "romanzo italiano classico ottocento", limit: 8})
        });
        const data = await res.json();
        console.log("Results:", data.results ? data.results.length : 0);
        if (data.results) {
            data.results.forEach((r, i) => {
                console.log("  " + (i+1) + ". " + (r.title_it || r.title_en) + " (" + (r.creator||"?") + ", " + r.year + ")");
            });
        }
    } catch(e) {
        console.log("Error:", e.message);
    }

    console.log("\n=== Test: horror movie ===");
    try {
        const res = await fetch("http://localhost:3456/api/search", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({query: "horror movie with ghosts and haunted house", limit: 8})
        });
        const data = await res.json();
        console.log("Results:", data.results ? data.results.length : 0);
        if (data.results) {
            data.results.forEach((r, i) => {
                console.log("  " + (i+1) + ". " + (r.title_it || r.title_en) + " (" + (r.creator||"?") + ", " + r.year + ")");
            });
        }
    } catch(e) {
        console.log("Error:", e.message);
    }
}
test();
