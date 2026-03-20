/**
 * Inspire v2 — HTTP Server
 *
 * Endpoints:
 *  POST /api/search   — Semantic search
 *  POST /api/plots    — Fetch full plots by work IDs
 *  GET  /api/stats    — Database statistics
 *  GET  /api/health   — Health check (Ollama + DB)
 *  GET  /              — Serve index.html (app) or welcome.html (setup)
 */

'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const db = require('./db');
const { search, generateInspireTexts, checkOllama, EMBEDDING_MODEL } = require('./search');

// ─── Configuration ───────────────────────────────────────────────

const PORT = parseInt(process.env.INSPIRE_PORT || '3457', 10);
const ROOT_DIR = path.join(__dirname, '..', 'public'); // public dir (contains index.html, style.css, app.js)

// ─── Express App ─────────────────────────────────────────────────

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ─── Static Files ────────────────────────────────────────────────

// Serve index.html, welcome.html, logo.svg, etc. from project root
app.use(express.static(ROOT_DIR, {
    index: 'index.html',
    extensions: ['html']
}));

// ─── API: Health Check ───────────────────────────────────────────

app.get('/api/health', async (req, res) => {
    try {
        const ollamaStatus = await checkOllama();
        const stats = db.getStats();

        res.json({
            status: 'ok',
            ollama: ollamaStatus.available,
            embedding_model: ollamaStatus.embedding_model || false,
            db_loaded: stats.total_works > 0,
            works_count: stats.total_works,
            version: '2.0.0'
        });
    } catch (err) {
        res.status(500).json({
            status: 'error',
            error: err.message
        });
    }
});

// ─── API: Database Stats ─────────────────────────────────────────

app.get('/api/stats', (req, res) => {
    try {
        const stats = db.getStats();
        const schemaVersion = db.getMeta('schema_version');
        const buildDate = db.getMeta('build_date');
        res.json({
            ...stats,
            schema_version: schemaVersion || '2.0.0',
            build_date: buildDate || null,
            db_size_mb: Math.round(getDbSizeMB())
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── API: Semantic Search ────────────────────────────────────────

app.post('/api/search', async (req, res) => {
    try {
        const {
            query,
            type = 'all',
            limit = 12,
            min_popularity = 0,
            safe_mode = false
        } = req.body;

        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const results = await search({
            query: query.trim(),
            type,
            limit: Math.min(limit, 50),
            min_popularity,
            safe_mode
        });

        res.json(results);
    } catch (err) {
        console.error('[api/search] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── API: Fetch Plots ────────────────────────────────────────────

app.post('/api/plots', (req, res) => {
    try {
        const { work_ids } = req.body;

        if (!Array.isArray(work_ids) || work_ids.length === 0) {
            return res.status(400).json({ error: 'work_ids array is required' });
        }

        // Limit to 50 IDs per request
        const ids = work_ids.slice(0, 50).map(Number).filter(n => n > 0);
        const plotsMap = db.getPlotsBatch(ids);

        // Transform to API format
        const plots = {};
        for (const [workId, langs] of Object.entries(plotsMap)) {
            plots[workId] = {};
            for (const [lang, plot] of Object.entries(langs)) {
                plots[workId][lang] = {
                    text: plot.plot_text,
                    short: plot.plot_short,
                    source: plot.source,
                    match_confidence: plot.match_confidence
                };
            }
        }

        res.json({ plots });
    } catch (err) {
        console.error('[api/plots] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── API: Personalized Inspire Texts ─────────────────────────────

app.post('/api/inspire', async (req, res) => {
    try {
        const { query, results } = req.body;

        if (!query || !Array.isArray(results) || results.length === 0) {
            return res.status(400).json({ error: 'query and results[] required' });
        }

        // Fetch plot texts for the results
        const workIds = results.map(r => r.id).filter(Boolean);
        const plotsMap = db.getPlotsBatch(workIds);

        // Attach plot text to each result
        const enrichedResults = results.slice(0, 3).map(r => {
            const plots = plotsMap[r.id] || {};
            const bestPlot = plots.it || plots.en || null;
            return {
                id: r.id,
                title_it: r.title_it,
                title_en: r.title_en,
                year: r.year,
                plot_text: bestPlot?.plot_text || bestPlot?.plot_short || ''
            };
        });

        const inspireMap = await generateInspireTexts(query, enrichedResults);
        res.json({ inspire: inspireMap });
    } catch (err) {
        console.error('[api/inspire] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Fallback: SPA routing ───────────────────────────────────────

app.get('*', (req, res) => {
    // For any non-API, non-static request, serve index.html
    res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

// ─── Helpers ─────────────────────────────────────────────────────

function getDbSizeMB() {
    try {
        const fs = require('fs');
        const stats = fs.statSync(db.DB_PATH);
        return stats.size / (1024 * 1024);
    } catch {
        return 0;
    }
}

// ─── Start Server ────────────────────────────────────────────────

function start() {
    // Initialize database
    db.getDb();

    const server = app.listen(PORT, '127.0.0.1', () => {
        console.log('');
        console.log('  ✦ INSPIRE v2 — Server avviato');
        console.log(`  ➜ http://localhost:${PORT}`);
        console.log(`  ➜ Database: ${db.DB_PATH}`);
        console.log(`  ➜ Embedding model: ${EMBEDDING_MODEL}`);
        console.log('');

        const stats = db.getStats();
        console.log(`  📚 ${stats.books} libri | 🎬 ${stats.movies} film`);
        console.log(`  📝 ${stats.with_plots_en} trame EN | ${stats.with_plots_it} trame IT`);
        console.log(`  🔢 ${stats.with_embeddings} embeddings (${stats.embedding_dim}-dim)`);
        console.log('');
    });

    // Graceful shutdown
    const shutdown = () => {
        console.log('\n[server] Shutting down...');
        server.close(() => {
            db.close();
            process.exit(0);
        });
        // Force close after 5s
        setTimeout(() => process.exit(1), 5000);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    return server;
}

// ─── Run ─────────────────────────────────────────────────────────

if (require.main === module) {
    start();
}

module.exports = { app, start };
