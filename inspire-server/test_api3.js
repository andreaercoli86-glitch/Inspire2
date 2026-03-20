async function test() {
    const queries = [
        {q: "romanzo di avventura con pirati", label: "Pirati"},
        {q: "science fiction time travel", label: "Sci-fi time travel"},
        {q: "romanzo italiano classico ottocento", label: "Classico italiano"},
        {q: "horror movie with ghosts", label: "Horror ghosts"},
        {q: "war movie world war 2", label: "WW2 movie"},
        {q: "fantasy book with dragons and magic", label: "Fantasy dragons"},
        {q: "thriller psicologico", label: "Thriller psicologico"},
        {q: "comedy romantic film", label: "Romantic comedy"}
    ];
    for (const {q, label} of queries) {
        try {
            const res = await fetch("http://localhost:3456/api/search", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({query: q, limit: 5})
            });
            const data = await res.json();
            console.log("\n[" + label + "] (" + (data.search_time_ms||"?") + "ms) " + (data.results?data.results.length:0) + " results:");
            if (data.results) {
                data.results.slice(0, 5).forEach((r, i) => {
                    console.log("  " + (i+1) + ". [" + r.badge + " " + (r.confidence||0).toFixed(2) + "] " + (r.title_it||r.title_en) + " (" + (r.creator||"?") + ", " + r.year + ")");
                });
            }
        } catch(e) { console.log("[" + label + "] Error: " + e.message); }
    }
}
test();
