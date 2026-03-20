/**
 * Build Pipeline Step 4: Generate embeddings via Ollama
 *
 * For each work in the database, generates a 768-dim embedding
 * using nomic-embed-text-v2-moe via Ollama /api/embed.
 *
 * Embedding input format: "{title_en}. {genres}. {plot_text_1000chars}"
 *
 * Usage: node build/generate-embeddings.js [--batch-size 50] [--model nomic-embed-text-v2-moe]
 */

'use strict';

const db = require('../db');

// â”€â”€â”€ Configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const args = process.argv.slice(2);
const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://localhost:11434';
const EMBEDDING_MODEL = args.find((a, i) => args[i - 1] === '--model') || 'qwen3-embedding:4b';
const BATCH_SIZE = parseInt(args.find((a, i) => args[i - 1] === '--batch-size') || '50');
const RESUME = args.includes('--resume'); // skip works that already have embeddings

// â”€â”€â”€ Ollama Embedding â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Generate embeddings for a batch of texts.
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
async function embedBatch(texts) {
    const res = await fetch(`${OLLAMA_BASE}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: texts
        })
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Ollama embed error ${res.status}: ${body}`);
    }

    const data = await res.json();
    return data.embeddings || [data.embedding];
}

/**
 * Build the text input for embedding a work.
 */
function buildEmbeddingInput(work, plotText) {
    const parts = [];

    // Title (prefer English for consistency with multilingual model)
    const title = work.title_en || work.title_it || work.title_orig || '';
    if (title) parts.push(title);

    // Genres
    try {
        const genres = JSON.parse(work.genres || '[]');
        if (genres.length > 0) parts.push(genres.join(', '));
    } catch { /* ignore */ }

    // Plot snippet (first 1000 chars for richer thematic embedding)
    if (plotText) {
        parts.push(plotText.substring(0, 1000));
    }

    return parts.join('. ');
}

// â”€â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function generateAll() {
    console.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
    console.log(' Inspire Build â€” Step 4: Generate Embeddings');
    console.log(`  Model: ${EMBEDDING_MODEL}`);
    console.log(`  Batch size: ${BATCH_SIZE}`);
    console.log(`  Resume: ${RESUME}`);
    console.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n');

    // Verify Ollama is available
    try {
        const tagRes = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (!tagRes.ok) throw new Error(`Status ${tagRes.status}`);
        const tags = await tagRes.json();
        const available = (tags.models || []).some(m =>
            (m.name || m.model || '').includes(EMBEDDING_MODEL.split(':')[0])
        );
        if (!available) {
            console.error(`âŒ Model ${EMBEDDING_MODEL} not found in Ollama.`);
            console.error(`   Run: ollama pull ${EMBEDDING_MODEL}`);
            process.exit(1);
        }
        console.log(`âœ“ Ollama connected, model ${EMBEDDING_MODEL} available\n`);
    } catch (err) {
        console.error(`âŒ Cannot connect to Ollama at ${OLLAMA_BASE}: ${err.message}`);
        process.exit(1);
    }

    const d = db.getDb();

    // Get only works WITH plots (RAG-quality: no plot = no embedding)
    let works;
    if (RESUME) {
        works = d.prepare(`
            SELECT DISTINCT w.* FROM works w
            INNER JOIN plots p ON w.id = p.work_id
            LEFT JOIN vec_works v ON v.work_id = w.id
            WHERE v.work_id IS NULL
            ORDER BY w.sitelinks DESC
        `).all();
        console.log(`Works with plots needing embeddings: ${works.length} (resume mode)\n`);
    } else {
        // Clear existing embeddings
        try { d.exec('DELETE FROM vec_works'); } catch { /* table may not exist */ }
        works = d.prepare(`
            SELECT DISTINCT w.* FROM works w
            INNER JOIN plots p ON w.id = p.work_id
            ORDER BY w.sitelinks DESC
        `).all();
        console.log(`Works with plots to process: ${works.length}\n`);
    }

    if (works.length === 0) {
        console.log('âœ… Nothing to do!');
        db.close();
        return;
    }

    // Pre-fetch plot_short for all works
    const plotStmt = d.prepare(`
        SELECT plot_text FROM plots
        WHERE work_id = ? AND language = 'en'
        ORDER BY match_confidence DESC
        LIMIT 1
    `);

    let processed = 0;
    let errors = 0;
    const startTime = Date.now();

    // Process in batches
    for (let i = 0; i < works.length; i += BATCH_SIZE) {
        const batch = works.slice(i, i + BATCH_SIZE);

        // Build input texts
        const texts = batch.map(work => {
            const plot = plotStmt.get(work.id);
            return buildEmbeddingInput(work, plot?.plot_text);
        });

        // Generate embeddings
        try {
            const embeddings = await embedBatch(texts);

            // Insert into vec_works
            const tx = d.transaction(() => {
                for (let j = 0; j < batch.length; j++) {
                    if (embeddings[j]) {
                        try {
                            db.insertEmbedding(batch[j].id, embeddings[j]);
                        } catch (err) {
                            errors++;
                        }
                    }
                }
            });
            tx();

            processed += batch.length;
        } catch (err) {
            console.error(`  âš  Batch error at offset ${i}: ${err.message}`);
            errors += batch.length;

            // Retry individually
            for (const work of batch) {
                try {
                    const plot = plotStmt.get(work.id);
                    const text = buildEmbeddingInput(work, plot?.plot_text);
                    const [embedding] = await embedBatch([text]);
                    if (embedding) {
                        db.insertEmbedding(work.id, embedding);
                        processed++;
                        errors--;
                    }
                } catch {
                    // Skip this work
                }
                await sleep(100);
            }
        }

        // Progress
        const pct = Math.round(((i + batch.length) / works.length) * 100);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = (processed / ((Date.now() - startTime) / 1000)).toFixed(1);
        const eta = ((works.length - i - batch.length) / (rate || 1)).toFixed(0);
        process.stdout.write(
            `\r  [${pct}%] ${processed}/${works.length} | ${rate} works/s | ETA ${eta}s | errors: ${errors}  `
        );
    }

    console.log('\n');
    console.log(`âœ… Done!`);
    console.log(`   ðŸ”¢ Embeddings generated: ${processed}`);
    console.log(`   âš  Errors: ${errors}`);
    console.log(`   â± Time: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} min`);

    db.close();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

if (require.main === module) {
    generateAll().catch(err => {
        console.error('âŒ Fatal error:', err);
        db.close();
        process.exit(1);
    });
}

module.exports = { generateAll, buildEmbeddingInput };

