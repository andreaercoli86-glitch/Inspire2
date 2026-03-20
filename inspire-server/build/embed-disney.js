'use strict';
const fs = require('fs');
const path = require('path');
const db = require('../db');

const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://localhost:11434';
const EMBEDDING_MODEL = 'qwen3-embedding:4b';
const LOG_FILE = path.join(__dirname, '..', '..', 'embed_disney_log.txt');

function log(msg) {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

async function embedBatch(texts) {
    const res = await fetch(`${OLLAMA_BASE}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
        signal: AbortSignal.timeout(120000)
    });
    if (!res.ok) throw new Error(`Ollama embed error ${res.status}`);
    const data = await res.json();
    return data.embeddings || [data.embedding];
}

function buildInput(work, plotText) {
    const parts = [];
    const title = work.title_en || work.title_it || '';
    if (title) parts.push(title);
    try {
        const genres = JSON.parse(work.genres || '[]');
        if (genres.length > 0) parts.push(genres.join(', '));
    } catch {}
    if (plotText) parts.push(plotText.substring(0, 1000));
    return parts.join('. ');
}

async function main() {
    fs.writeFileSync(LOG_FILE, '');
    log('=== Generate Embeddings for Disney/Pixar ===\n');

    const d = db.getDb();

    // Get Disney/Pixar works (id >= 24422) that have plots
    const works = d.prepare(`
        SELECT DISTINCT w.* FROM works w
        INNER JOIN plots p ON w.id = p.work_id
        WHERE w.id >= 24422 AND w.id <= 24469
        ORDER BY w.id
    `).all();
    log(`Found ${works.length} Disney/Pixar works with plots`);

    // Check which already have embeddings
    const existingVec = new Set();
    try {
        // sqlite-vec doesn't support normal SELECT for checking existence
        // So we just try to insert and handle errors
    } catch(e) {}

    // Get best plot for each work
    const plotMap = {};
    for (const w of works) {
        const plots = d.prepare('SELECT language, plot_text FROM plots WHERE work_id = ? ORDER BY language').all(w.id);
        // Prefer English plot
        const enPlot = plots.find(p => p.language === 'en');
        const itPlot = plots.find(p => p.language === 'it');
        plotMap[w.id] = (enPlot || itPlot)?.plot_text || null;
    }

    // Build texts and generate embeddings in batches
    const BATCH_SIZE = 10;
    let success = 0, failed = 0;

    for (let i = 0; i < works.length; i += BATCH_SIZE) {
        const batch = works.slice(i, i + BATCH_SIZE);
        const texts = batch.map(w => buildInput(w, plotMap[w.id]));

        try {
            log(`Batch ${Math.floor(i/BATCH_SIZE) + 1}: embedding ${batch.length} works (${batch.map(w => w.title_en || w.title_it).join(', ')})`);
            const embeddings = await embedBatch(texts);

            for (let j = 0; j < batch.length; j++) {
                try {
                    db.insertEmbedding(batch[j].id, embeddings[j]);
                    success++;
                } catch(e) {
                    log(`  ERROR inserting embedding for ${batch[j].title_en}: ${e.message}`);
                    failed++;
                }
            }
            log(`  OK: ${batch.length} embeddings generated`);
        } catch(e) {
            log(`  BATCH ERROR: ${e.message}`);
            failed += batch.length;
        }
    }

    log(`\n=== DONE === Success: ${success}, Failed: ${failed}`);

    // Verify
    const vecCount = d.prepare('SELECT COUNT(*) as cnt FROM vec_works').get();
    log(`Total embeddings in DB: ${vecCount.cnt}`);

    db.close();
}

main().catch(e => { log('FATAL: ' + e.message); process.exit(1); });
