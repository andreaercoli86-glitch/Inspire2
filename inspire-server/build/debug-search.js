'use strict';
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { search, expandQuery, LLM_MODEL } = require('../search');

const LOG = path.join(__dirname, '..', '..', 'debug_search_log.txt');

async function debugSearch(query, type = 'movie') {
    const start = Date.now();

    // Step 0: Expand query
    const expandedQuery = await expandQuery(query, type);
    let out = `\n${'='.repeat(80)}\nQuery: "${query}"\nExpanded: "${expandedQuery.substring(0, 200)}"\n${'='.repeat(80)}\n`;

    // Step 1: Get raw vector results
    const OLLAMA_BASE = 'http://localhost:11434';
    const embRes = await fetch(`${OLLAMA_BASE}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'qwen3-embedding:4b', input: expandedQuery })
    });
    const embData = await embRes.json();
    const queryVec = embData.embeddings?.[0] || embData.embedding;

    const vecResults = db.vectorSearchWithPlots(queryVec, { type, limit: 30 });
    const bm25Results = db.bm25Search(expandedQuery, { type, limit: 30 });

    // Track key films we care about
    const keyFilms = ['A Beautiful Mind', 'Theory of Everything', 'Oppenheimer', 'Imitation Game', 'Hidden Figures', 'Good Will Hunting'];

    out += '\n--- VECTOR SEARCH (top 20) ---\n';
    vecResults.slice(0, 20).forEach((r, i) => {
        const isKey = keyFilms.some(k => (r.title_en || '').includes(k));
        const marker = isKey ? ' *** KEY ***' : '';
        out += `  ${(i+1).toString().padStart(3)}. [sim=${(r.similarity||0).toFixed(4)}] ${r.title_en || r.title_it} (${r.year}) sitelinks=${r.sitelinks}${marker}\n`;
    });

    // Check where key films rank in vector results
    out += '\n--- KEY FILMS in VECTOR ranking ---\n';
    for (const key of keyFilms) {
        const idx = vecResults.findIndex(r => (r.title_en || '').includes(key));
        if (idx >= 0) {
            out += `  ${key}: rank ${idx+1}, sim=${(vecResults[idx].similarity||0).toFixed(4)}\n`;
        } else {
            out += `  ${key}: NOT IN TOP 30\n`;
        }
    }

    out += '\n--- BM25 SEARCH (top 20) ---\n';
    bm25Results.slice(0, 20).forEach((r, i) => {
        const isKey = keyFilms.some(k => (r.title_en || '').includes(k));
        const marker = isKey ? ' *** KEY ***' : '';
        out += `  ${(i+1).toString().padStart(3)}. ${r.title_en || r.title_it} (${r.year}) sitelinks=${r.sitelinks}${marker}\n`;
    });

    // Check where key films rank in BM25
    out += '\n--- KEY FILMS in BM25 ranking ---\n';
    for (const key of keyFilms) {
        const idx = bm25Results.findIndex(r => (r.title_en || '').includes(key));
        if (idx >= 0) {
            out += `  ${key}: rank ${idx+1}\n`;
        } else {
            out += `  ${key}: NOT IN TOP 30\n`;
        }
    }

    // Run full search to see final ranking
    out += '\n--- FINAL RRF RANKING (search API) ---\n';
    const results = await search({ query, type, limit: 15 });
    results.results.forEach((r, i) => {
        const isKey = keyFilms.some(k => (r.title_en || '').includes(k));
        const marker = isKey ? ' *** KEY ***' : '';
        out += `  ${(i+1).toString().padStart(3)}. [${r.badge}] conf=${r.confidence} rrf=${r.rrf_score} | ${r.title_it || r.title_en} (${r.year}) | vec_rank=${r._vec_rank} bm25_rank=${r._bm25_rank} agree=${r._agreement}${marker}\n`;
    });

    out += `\nTotal time: ${Date.now() - start}ms\n`;
    return out;
}

async function main() {
    fs.writeFileSync(LOG, '');
    console.log('Running debug search...');
    try {
        const result = await debugSearch('Vorrei appassionarmi ad un percorso accademico. Fammi vedere un film che parla di un grande scienziato.', 'movie');
        fs.appendFileSync(LOG, result);
        console.log('Done! Check ' + LOG);
    } catch(e) {
        console.error('ERROR:', e.message, e.stack);
    }
    db.close();
}

main();
