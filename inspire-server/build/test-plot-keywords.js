'use strict';
const fs = require('fs');
const db = require('../db');
const path = require('path');
const LOG = path.join(__dirname, '..', '..', 'plot_keywords_log.txt');

// Simulate the keyword extraction from search.js
const CONCEPT_TO_PLOT_KEYWORDS = {
    'scienzia':   ['scientist', 'physicist', 'mathematician', 'Nobel', 'theorem', 'equation', 'scienziato', 'fisico', 'matematico'],
    'accademic':  ['university', 'Cambridge', 'Princeton', 'Harvard', 'MIT', 'doctorate', 'thesis', 'università'],
    'fisic':      ['physicist', 'physics', 'quantum', 'relativity', 'atom', 'nuclear', 'fisico', 'fisica'],
    'matemati':   ['mathematician', 'mathematics', 'equation', 'theorem', 'proof', 'matematico', 'matematica'],
};

const query = 'Vorrei appassionarmi ad un percorso accademico. Fammi vedere un film che parla di un grande scienziato.';
const expanded = query + ' scienza ricerca scoperta conoscenza intelletto genio laboratorio innovazione matematica fisica';
const combined = (query + ' ' + expanded).toLowerCase();

const keywordsSet = new Set();
for (const [stem, plotWords] of Object.entries(CONCEPT_TO_PLOT_KEYWORDS)) {
    if (combined.includes(stem)) {
        for (const pw of plotWords) keywordsSet.add(pw);
    }
}
const keywords = [...keywordsSet];

let out = `Keywords extracted: ${keywords.join(', ')}\n\n`;

// Test with minMatches=1
const results1 = db.plotKeywordSearch(keywords, { type: 'movie', limit: 30, minMatches: 1 });
out += `=== minMatches=1 (${results1.length} results) ===\n`;
results1.forEach((r, i) => {
    out += `${(i+1).toString().padStart(2)}. [mc=${r.match_count}] ${r.title_en} (${r.year}) sitelinks=${r.sitelinks}\n`;
});

// Test with minMatches=2
const results2 = db.plotKeywordSearch(keywords, { type: 'movie', limit: 30, minMatches: 2 });
out += `\n=== minMatches=2 (${results2.length} results) ===\n`;
results2.forEach((r, i) => {
    out += `${(i+1).toString().padStart(2)}. [mc=${r.match_count}] ${r.title_en} (${r.year}) sitelinks=${r.sitelinks}\n`;
});

// Check specific films
out += '\n=== Checking A Beautiful Mind plot text ===\n';
const d = db.getDb();
const abm = d.prepare("SELECT w.id, w.title_en, w.sitelinks FROM works w WHERE w.title_en LIKE '%Beautiful Mind%'").all();
for (const w of abm) {
    out += `Work: ${w.title_en} (id=${w.id}, sitelinks=${w.sitelinks})\n`;
    const plots = d.prepare("SELECT language, substr(plot_text, 1, 500) as excerpt FROM plots WHERE work_id = ?").all(w.id);
    for (const p of plots) {
        out += `  Plot [${p.language}]: ${p.excerpt}\n`;
        // Check each keyword
        const fullPlot = d.prepare("SELECT plot_text FROM plots WHERE work_id = ? AND language = ?").get(w.id, p.language);
        for (const kw of keywords) {
            if (fullPlot.plot_text.toLowerCase().includes(kw.toLowerCase())) {
                out += `    MATCH: "${kw}"\n`;
            }
        }
    }
}

out += '\n=== Checking Theory of Everything plot text ===\n';
const toe = d.prepare("SELECT w.id, w.title_en, w.sitelinks FROM works w WHERE w.title_en LIKE '%Theory of Everything%'").all();
for (const w of toe) {
    out += `Work: ${w.title_en} (id=${w.id}, sitelinks=${w.sitelinks})\n`;
    const plots = d.prepare("SELECT language, substr(plot_text, 1, 500) as excerpt FROM plots WHERE work_id = ?").all(w.id);
    for (const p of plots) {
        out += `  Plot [${p.language}]: ${p.excerpt}\n`;
        const fullPlot = d.prepare("SELECT plot_text FROM plots WHERE work_id = ? AND language = ?").get(w.id, p.language);
        for (const kw of keywords) {
            if (fullPlot.plot_text.toLowerCase().includes(kw.toLowerCase())) {
                out += `    MATCH: "${kw}"\n`;
            }
        }
    }
}

out += '\n=== Checking Oppenheimer plot text ===\n';
const opp = d.prepare("SELECT w.id, w.title_en, w.sitelinks FROM works w WHERE w.title_en LIKE '%Oppenheimer%'").all();
for (const w of opp) {
    out += `Work: ${w.title_en} (id=${w.id}, sitelinks=${w.sitelinks})\n`;
    const plots = d.prepare("SELECT language, substr(plot_text, 1, 500) as excerpt FROM plots WHERE work_id = ?").all(w.id);
    for (const p of plots) {
        out += `  Plot [${p.language}]: ${p.excerpt}\n`;
        const fullPlot = d.prepare("SELECT plot_text FROM plots WHERE work_id = ? AND language = ?").get(w.id, p.language);
        for (const kw of keywords) {
            if (fullPlot.plot_text.toLowerCase().includes(kw.toLowerCase())) {
                out += `    MATCH: "${kw}"\n`;
            }
        }
    }
}

fs.writeFileSync(LOG, out);
console.log('Done! Check ' + LOG);
db.close();
