async function test() {
    const queries = [
        "voglio appassionarmi al giardinaggio",
        "mi sento solo e vorrei una storia che mi faccia compagnia",
        "cerco qualcosa di leggero per una serata con amici",
        "mi interessa la storia dell'antica Roma",
        "vorrei capire meglio l'intelligenza artificiale",
        "ho bisogno di motivazione, qualcosa di ispirante"
    ];
    for (const q of queries) {
        try {
            const res = await fetch("http://localhost:3456/api/search", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({query: q, limit: 5})
            });
            const data = await res.json();
            console.log("\n>> " + q);
            console.log("   " + (data.search_time_ms||"?") + "ms, " + (data.results?data.results.length:0) + " results:");
            if (data.results) {
                data.results.forEach((r, i) => {
                    console.log("   " + (i+1) + ". [" + r.type + "|" + r.badge + "] " + (r.title_it||r.title_en) + " (" + (r.creator||"?") + ", " + r.year + ")");
                });
            }
        } catch(e) { console.log("Error: " + e.message); }
    }
}
test();
