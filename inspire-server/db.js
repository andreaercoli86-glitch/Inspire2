/**
 * Inspire v2 â€” Database wrapper (SQLite + sqlite-vec)
 *
 * Handles:
 *  - Database initialization and schema creation
 *  - sqlite-vec extension loading for vector search
 *  - CRUD operations for works, plots, embeddings
 *  - FTS5 full-text search fallback
 */

'use strict';

const path = require('path');
const Database = require('better-sqlite3');

// â”€â”€â”€ Configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const DB_PATH = process.env.INSPIRE_DB_PATH ||
    path.join(__dirname, '..', 'data', 'inspire.db');

const EMBEDDING_DIM = 2560; // qwen3-embedding:4b

// â”€â”€â”€ Database singleton â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let db = null;

/**
 * Open or create the database, load sqlite-vec, ensure schema exists.
 * @returns {Database} better-sqlite3 instance
 */
function getDb() {
    if (db) return db;

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000'); // 64 MB cache
    db.pragma('mmap_size = 268435456'); // 256 MB mmap

    // Load sqlite-vec extension
    try {
        const sqliteVec = require('sqlite-vec');
        sqliteVec.load(db);
        console.log('[db] sqlite-vec loaded successfully');
    } catch (err) {
        console.error('[db] WARNING: sqlite-vec not available â€”', err.message);
        console.error('[db] Vector search will not work. Install: npm install sqlite-vec');
    }

    ensureSchema();
    console.log(`[db] Database ready: ${DB_PATH}`);
    return db;
}

/**
 * Create tables if they don't exist.
 */
function ensureSchema() {
    db.exec(`
        -- â•â•â• WORKS (metadata from Wikidata) â•â•â•
        CREATE TABLE IF NOT EXISTS works (
            id          INTEGER PRIMARY KEY,
            wikidata_id TEXT UNIQUE NOT NULL,
            type        TEXT NOT NULL CHECK(type IN ('book', 'movie')),
            title_it    TEXT,
            title_en    TEXT,
            title_orig  TEXT,
            creator     TEXT,
            year        INTEGER,
            genres      TEXT DEFAULT '[]',
            country     TEXT,
            sitelinks   INTEGER DEFAULT 0,
            popularity  REAL DEFAULT 0,
            awards      TEXT DEFAULT '[]',
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_works_type ON works(type);
        CREATE INDEX IF NOT EXISTS idx_works_popularity ON works(popularity DESC);
        CREATE INDEX IF NOT EXISTS idx_works_year ON works(year);
        CREATE INDEX IF NOT EXISTS idx_works_wikidata ON works(wikidata_id);

        -- â•â•â• PLOTS (synopses from Wikipedia dumps + Tell Me Again!) â•â•â•
        CREATE TABLE IF NOT EXISTS plots (
            id               INTEGER PRIMARY KEY,
            work_id          INTEGER NOT NULL REFERENCES works(id),
            source           TEXT NOT NULL,
            language         TEXT NOT NULL DEFAULT 'en',
            plot_text        TEXT NOT NULL,
            plot_short       TEXT,
            match_confidence REAL DEFAULT 1.0,
            created_at       TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_plots_work ON plots(work_id);
        CREATE INDEX IF NOT EXISTS idx_plots_lang ON plots(language);
    `);

    // â•â•â• FTS5 full-text search â•â•â•
    try {
        db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS search_text USING fts5(
                work_id,
                title_it,
                title_en,
                creator,
                genres,
                plot_short,
                enrichment_text,
                tokenize='unicode61 remove_diacritics 2'
            );
        `);
    } catch (err) {
        if (!err.message.includes('already exists')) {
            // Table exists with old schema (no enrichment_text) — recreate it
            try {
                db.exec('DROP TABLE IF EXISTS search_text');
                db.exec(`
                    CREATE VIRTUAL TABLE search_text USING fts5(
                        work_id, title_it, title_en, creator, genres, plot_short, enrichment_text,
                        tokenize='unicode61 remove_diacritics 2'
                    );
                `);
                console.log('[db] FTS5 table recreated with enrichment_text column');
            } catch (e2) {
                console.error('[db] FTS5 recreate error:', e2.message);
            }
        }
    }

    // â•â•â• Vector table (sqlite-vec) â•â•â•
    try {
        db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS vec_works USING vec0(
                work_id INTEGER PRIMARY KEY,
                embedding FLOAT[${EMBEDDING_DIM}]
            );
        `);
    } catch (err) {
        if (!err.message.includes('already exists')) {
            console.error('[db] vec_works init error:', err.message);
        }
    }

    // === ENRICHMENTS (pre-computed why/how for RAG) ===
    db.exec(`
        CREATE TABLE IF NOT EXISTS enrichments (
            id          INTEGER PRIMARY KEY,
            work_id     INTEGER NOT NULL REFERENCES works(id),
            language    TEXT NOT NULL DEFAULT 'it',
            themes      TEXT DEFAULT '[]',
            why_text    TEXT NOT NULL,
            how_text    TEXT NOT NULL,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(work_id, language)
        );
        CREATE INDEX IF NOT EXISTS idx_enrichments_work ON enrichments(work_id);
    `);

    // === META (DB versioning & build metadata) ===
    db.exec(`
        CREATE TABLE IF NOT EXISTS meta (
            key         TEXT PRIMARY KEY,
            value       TEXT NOT NULL,
            updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Set default schema version if not present
    const existing = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version');
    if (!existing) {
        const metaInsert = db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)');
        metaInsert.run('schema_version', '2.1.0');
        metaInsert.run('build_date', new Date().toISOString().split('T')[0]);
        metaInsert.run('embedding_model', 'qwen3-embedding:4b');
        metaInsert.run('embedding_dim', String(EMBEDDING_DIM));
    }
}

// â”€â”€â”€ Works CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const stmtCache = {};

function getStmt(key, sql) {
    if (!stmtCache[key]) {
        stmtCache[key] = getDb().prepare(sql);
    }
    return stmtCache[key];
}

/**
 * Insert or update a work.
 */
function upsertWork(work) {
    const stmt = getStmt('upsertWork', `
        INSERT INTO works (wikidata_id, type, title_it, title_en, title_orig, creator, year, genres, country, sitelinks, popularity, awards)
        VALUES (@wikidata_id, @type, @title_it, @title_en, @title_orig, @creator, @year, @genres, @country, @sitelinks, @popularity, @awards)
        ON CONFLICT(wikidata_id) DO UPDATE SET
            type=excluded.type, title_it=excluded.title_it, title_en=excluded.title_en,
            title_orig=excluded.title_orig, creator=excluded.creator, year=excluded.year,
            genres=excluded.genres, country=excluded.country, sitelinks=excluded.sitelinks,
            popularity=excluded.popularity, awards=excluded.awards
    `);
    return stmt.run({
        wikidata_id: work.wikidata_id,
        type: work.type,
        title_it: work.title_it || null,
        title_en: work.title_en || null,
        title_orig: work.title_orig || null,
        creator: work.creator || null,
        year: work.year || null,
        genres: JSON.stringify(work.genres || []),
        country: work.country || null,
        sitelinks: work.sitelinks || 0,
        popularity: work.popularity || 0,
        awards: JSON.stringify(work.awards || [])
    });
}

/**
 * Get a work by its internal ID.
 */
function getWorkById(id) {
    return getStmt('getWorkById', 'SELECT * FROM works WHERE id = ?').get(id);
}

/**
 * Get a work by Wikidata ID.
 */
function getWorkByWikidataId(wikidataId) {
    return getStmt('getWorkByWikidata', 'SELECT * FROM works WHERE wikidata_id = ?').get(wikidataId);
}

/**
 * Get total work count, optionally filtered by type.
 */
function getWorkCount(type) {
    if (type) {
        return getStmt('countByType', 'SELECT COUNT(*) as cnt FROM works WHERE type = ?').get(type).cnt;
    }
    return getStmt('countAll', 'SELECT COUNT(*) as cnt FROM works').get().cnt;
}

// â”€â”€â”€ Plots CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Insert a plot (synopsis) for a work.
 */
function insertPlot(plot) {
    const stmt = getStmt('insertPlot', `
        INSERT INTO plots (work_id, source, language, plot_text, plot_short, match_confidence)
        VALUES (@work_id, @source, @language, @plot_text, @plot_short, @match_confidence)
    `);
    return stmt.run({
        work_id: plot.work_id,
        source: plot.source,
        language: plot.language || 'en',
        plot_text: plot.plot_text,
        plot_short: plot.plot_short || plot.plot_text.substring(0, 500),
        match_confidence: plot.match_confidence ?? 1.0
    });
}

/**
 * Get plots for a work, optionally filtered by language.
 * Returns the best quality plot per language (highest match_confidence).
 */
function getPlots(workId, language) {
    if (language) {
        return getStmt('plotsByLang', `
            SELECT * FROM plots WHERE work_id = ? AND language = ?
            ORDER BY match_confidence DESC LIMIT 1
        `).get(workId, language);
    }
    return getStmt('plotsByWork', `
        SELECT * FROM plots WHERE work_id = ?
        ORDER BY language ASC, match_confidence DESC
    `).all(workId);
}

/**
 * Get plots for multiple works at once (batch).
 */
function getPlotsBatch(workIds) {
    if (!workIds.length) return {};
    const placeholders = workIds.map(() => '?').join(',');
    const rows = getDb().prepare(`
        SELECT * FROM plots WHERE work_id IN (${placeholders})
        ORDER BY work_id, language ASC, match_confidence DESC
    `).all(...workIds);

    const result = {};
    for (const row of rows) {
        if (!result[row.work_id]) result[row.work_id] = {};
        // Keep best per language
        if (!result[row.work_id][row.language]) {
            result[row.work_id][row.language] = row;
        }
    }
    return result;
}

/**
 * Count plots, optionally by language.
 */
function getPlotCount(language) {
    if (language) {
        return getStmt('plotCountLang', 'SELECT COUNT(*) as cnt FROM plots WHERE language = ?').get(language).cnt;
    }
    return getStmt('plotCountAll', 'SELECT COUNT(DISTINCT work_id) as cnt FROM plots').get().cnt;
}

// â”€â”€â”€ Embeddings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Insert an embedding vector for a work.
 * @param {number} workId
 * @param {Float32Array|number[]} embedding â€” 768-dim vector
 */
function insertEmbedding(workId, embedding) {
    const vec = embedding instanceof Float32Array ? embedding : new Float32Array(embedding);
    const stmt = getStmt('insertEmbed', `
        INSERT INTO vec_works (work_id, embedding) VALUES (CAST(? AS INTEGER), ?)
    `);
    return stmt.run(workId, Buffer.from(vec.buffer));
}

/**
 * Search for similar works by vector similarity (cosine distance).
 * @param {Float32Array|number[]} queryVec â€” 768-dim query vector
 * @param {Object} opts â€” { type, limit, minPopularity }
 * @returns {Array} ranked results with similarity score
 */
function vectorSearch(queryVec, opts = {}) {
    const vec = queryVec instanceof Float32Array ? queryVec : new Float32Array(queryVec);
    const limit = opts.limit || 12;

    // sqlite-vec KNN search
    const vecResults = getDb().prepare(`
        SELECT work_id, distance
        FROM vec_works
        WHERE embedding MATCH ?
        ORDER BY distance
        LIMIT ?
    `).all(Buffer.from(vec.buffer), limit * 3); // fetch extra for post-filtering

    if (!vecResults.length) return [];

    // Fetch full work metadata for matched IDs
    const ids = vecResults.map(r => r.work_id);
    const placeholders = ids.map(() => '?').join(',');
    const works = getDb().prepare(`
        SELECT * FROM works WHERE id IN (${placeholders})
    `).all(...ids);

    const workMap = {};
    for (const w of works) workMap[w.id] = w;

    // Merge + filter + score
    let results = vecResults
        .map(r => {
            const work = workMap[r.work_id];
            if (!work) return null;
            // sqlite-vec returns L2 distance; convert to similarity (0-1)
            // cosine_similarity â‰ˆ 1 - (distanceÂ² / 2) for normalized vectors
            const similarity = Math.max(0, 1 - (r.distance * r.distance / 2));
            return { ...work, similarity, _distance: r.distance };
        })
        .filter(Boolean);

    // Apply filters
    if (opts.type) {
        results = results.filter(r => r.type === opts.type);
    }
    if (opts.minPopularity) {
        results = results.filter(r => r.popularity >= opts.minPopularity);
    }
    // Sort by similarity descending, limit
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
}

// â”€â”€â”€ FTS5 Search (fallback) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Full-text search as fallback when vector search returns insufficient results.
 */
function textSearch(query, opts = {}) {
    const limit = opts.limit || 12;
    try {
        const rows = getDb().prepare(`
            SELECT work_id, rank
            FROM search_text
            WHERE search_text MATCH ?
            ORDER BY rank
            LIMIT ?
        `).all(query, limit * 2);

        if (!rows.length) return [];

        const ids = rows.map(r => parseInt(r.work_id));
        const placeholders = ids.map(() => '?').join(',');
        const works = getDb().prepare(`
            SELECT * FROM works WHERE id IN (${placeholders})
        `).all(...ids);

        const workMap = {};
        for (const w of works) workMap[w.id] = w;

        let results = rows
            .map(r => {
                const work = workMap[parseInt(r.work_id)];
                if (!work) return null;
                return { ...work, similarity: Math.max(0, 1 + r.rank / 10), _fts: true };
            })
            .filter(Boolean);

        if (opts.type) results = results.filter(r => r.type === opts.type);
        return results.slice(0, limit);
    } catch (err) {
        console.error('[db] FTS5 search error:', err.message);
        return [];
    }
}

// â”€â”€â”€ FTS5 Index Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Rebuild the FTS5 index from current works + plots data.
 */
function rebuildFtsIndex() {
    const d = getDb();
    d.exec('DELETE FROM search_text');

    const works = d.prepare('SELECT * FROM works').all();
    const insert = d.prepare(`
        INSERT INTO search_text (work_id, title_it, title_en, creator, genres, plot_short, enrichment_text)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const plotStmt = d.prepare(`
        SELECT plot_text FROM plots WHERE work_id = ? ORDER BY language ASC LIMIT 1
    `);

    const enrichStmt = d.prepare(`
        SELECT why_text, how_text FROM enrichments WHERE work_id = ? AND language = 'it' LIMIT 1
    `);

    const tx = d.transaction(() => {
        for (const w of works) {
            const plot = plotStmt.get(w.id);
            const enrichment = enrichStmt.get(w.id);
            const plotText = plot?.plot_text || '';
            // Combine why + how text for thematic BM25 matching
            const enrichText = enrichment
                ? `${enrichment.why_text || ''} ${enrichment.how_text || ''}`
                : '';
            insert.run(
                String(w.id),
                w.title_it || '',
                w.title_en || '',
                w.creator || '',
                w.genres || '',
                plotText.substring(0, 2000),
                enrichText
            );
        }
    });
    tx();
    console.log(`[db] FTS5 index rebuilt: ${works.length} entries`);
}

// â”€â”€â”€ Stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Get database statistics.
 */
function getStats() {
    const d = getDb();
    const totalWorks = d.prepare('SELECT COUNT(*) as cnt FROM works').get().cnt;
    const books = d.prepare("SELECT COUNT(*) as cnt FROM works WHERE type='book'").get().cnt;
    const movies = d.prepare("SELECT COUNT(*) as cnt FROM works WHERE type='movie'").get().cnt;
    const plotsEn = d.prepare("SELECT COUNT(DISTINCT work_id) as cnt FROM plots WHERE language='en'").get().cnt;
    const plotsIt = d.prepare("SELECT COUNT(DISTINCT work_id) as cnt FROM plots WHERE language='it'").get().cnt;

    let vecCount = 0;
    try {
        vecCount = d.prepare('SELECT COUNT(*) as cnt FROM vec_works').get().cnt;
    } catch { /* vec table may not exist */ }

    return {
        total_works: totalWorks,
        books,
        movies,
        with_plots_en: plotsEn,
        with_plots_it: plotsIt,
        with_embeddings: vecCount,
        embedding_model: 'nomic-embed-text-v2-moe',
        embedding_dim: EMBEDDING_DIM
    };
}

// â”€â”€â”€ Lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Close database connection.
 */
function close() {
    if (db) {
        db.close();
        db = null;
        Object.keys(stmtCache).forEach(k => delete stmtCache[k]);
        console.log('[db] Database closed');
    }
}

// â”€â”€â”€ Exports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// --- Enrichments (pre-computed RAG data) ---

/**
 * Insert or update an enrichment for a work.
 */
function upsertEnrichment(data) {
    const stmt = getStmt('upsertEnrichment', `
        INSERT INTO enrichments (work_id, language, themes, why_text, how_text)
        VALUES (@work_id, @language, @themes, @why_text, @how_text)
        ON CONFLICT(work_id, language) DO UPDATE SET
            themes=excluded.themes, why_text=excluded.why_text,
            how_text=excluded.how_text, created_at=CURRENT_TIMESTAMP
    `);
    return stmt.run({
        work_id: data.work_id,
        language: data.language || 'it',
        themes: JSON.stringify(data.themes || []),
        why_text: data.why_text,
        how_text: data.how_text
    });
}

/**
 * Get enrichments for multiple works at once (batch).
 */
function getEnrichmentsBatch(workIds, language) {
    if (!workIds.length) return {};
    const lang = language || 'it';
    const placeholders = workIds.map(() => '?').join(',');
    const rows = getDb().prepare(`
        SELECT * FROM enrichments
        WHERE work_id IN (${placeholders}) AND language = ?
    `).all(...workIds, lang);

    const result = {};
    for (const row of rows) {
        result[row.work_id] = row;
    }
    return result;
}

/**
 * Vector search filtered to only works that have plots (RAG-safe).
 */
function vectorSearchWithPlots(queryVec, opts = {}) {
    const vec = queryVec instanceof Float32Array ? queryVec : new Float32Array(queryVec);
    const limit = opts.limit || 12;

    // KNN search — fetch extra to allow filtering
    const vecResults = getDb().prepare(`
        SELECT work_id, distance
        FROM vec_works
        WHERE embedding MATCH ?
        ORDER BY distance
        LIMIT ?
    `).all(Buffer.from(vec.buffer), limit * 5);

    if (!vecResults.length) return [];

    // Fetch full work metadata + check for plot existence in one query
    const ids = vecResults.map(r => r.work_id);
    const placeholders = ids.map(() => '?').join(',');
    const works = getDb().prepare(`
        SELECT w.*, 1 as has_plot
        FROM works w
        INNER JOIN plots p ON w.id = p.work_id
        WHERE w.id IN (${placeholders})
        GROUP BY w.id
    `).all(...ids);

    const workMap = {};
    for (const w of works) workMap[w.id] = w;

    let results = vecResults
        .map(r => {
            const work = workMap[r.work_id];
            if (!work) return null; // No plot = excluded
            const similarity = Math.max(0, 1 - (r.distance * r.distance / 2));
            return { ...work, similarity, _distance: r.distance };
        })
        .filter(Boolean);

    // Apply type/origin filters
    if (opts.type) results = results.filter(r => r.type === opts.type);
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
}

/**
 * BM25 text search via FTS5 — returns ranked results with score.
 * Only returns works that have plots (RAG-safe).
 */
function bm25Search(query, opts = {}) {
    const limit = opts.limit || 20;
    try {
        // Sanitize query for FTS5 (remove special chars, keep accented letters)
        const safeQuery = query.replace(/[^\w\s\u00C0-\u024F]/g, ' ').trim();
        if (!safeQuery) return [];

        // Split into words and join with OR for broader matching
        // FTS5 default is AND (all words must match) — too restrictive for thematic queries
        const words = safeQuery.split(/\s+/).filter(w => w.length >= 3);
        if (!words.length) return [];
        const ftsQuery = words.join(' OR ');

        // Step 1: FTS5 search (no JOIN — FTS5 tables don't play well with JOINs)
        const rows = getDb().prepare(`
            SELECT work_id, rank as bm25_score
            FROM search_text
            WHERE search_text MATCH ?
            ORDER BY rank
            LIMIT ?
        `).all(ftsQuery, limit * 4);

        if (!rows.length) return [];

        // Step 2: Fetch works that have plots (filter out plotless works)
        const ids = rows.map(r => parseInt(r.work_id));
        const placeholders = ids.map(() => '?').join(',');
        const works = getDb().prepare(`
            SELECT w.*
            FROM works w
            INNER JOIN plots p ON w.id = p.work_id
            WHERE w.id IN (${placeholders})
            GROUP BY w.id
        `).all(...ids);

        const workMap = {};
        for (const w of works) workMap[w.id] = w;

        // Step 3: Merge, preserving BM25 rank order
        let results = rows
            .map(r => {
                const work = workMap[parseInt(r.work_id)];
                if (!work) return null; // No plot = excluded
                return { ...work, bm25_score: r.bm25_score };
            })
            .filter(Boolean);

        if (opts.type) results = results.filter(r => r.type === opts.type);

        return results.slice(0, limit);
    } catch (err) {
        console.error('[db] BM25 search error:', err.message);
        return [];
    }
}

/**
 * Focused keyword search on plots.
 * Unlike BM25 which uses OR on all words (noisy), this does targeted LIKE
 * searches on plot_text for specific content keywords, then ranks by sitelinks.
 *
 * Used to find works whose plots directly mention key concepts from the query
 * (e.g., "mathematician", "physicist", "scientist" for a science query).
 *
 * @param {string[]} keywords - Specific keywords to search in plot text
 * @param {Object} opts - { type, limit }
 * @returns {Array} Works matching any keyword, sorted by sitelinks desc
 */
function plotKeywordSearch(keywords, opts = {}) {
    const { type = null, limit = 30, minMatches = 2 } = opts;
    if (!keywords.length) return [];

    const d = getDb();

    // For each work, count how many different keywords match its plot.
    // Only return works matching at least `minMatches` keywords.
    // This filters out films that only tangentially mention one term.
    //
    // We use a scoring approach: each keyword match adds 1 point,
    // then we combine match_count with sitelinks for final ranking.
    const matchCountExpr = keywords
        .map(() => '(CASE WHEN p.plot_text LIKE ? THEN 1 ELSE 0 END)')
        .join(' + ');
    const params = keywords.map(k => `%${k}%`);

    // Use MAX() for match_count to get the best score across all plots for each work.
    // Without MAX(), SQLite's GROUP BY returns match_count from an arbitrary row,
    // which might be 0 for the Italian plot when only the English plot matches.
    let sql = `
        SELECT w.*, MAX(${matchCountExpr}) as match_count
        FROM works w
        INNER JOIN plots p ON w.id = p.work_id
        WHERE 1=1
    `;
    if (type) {
        sql += ' AND w.type = ?';
        params.push(type);
    }
    sql += ` GROUP BY w.id
             HAVING match_count >= ?
             ORDER BY match_count DESC, w.sitelinks DESC
             LIMIT ?`;
    params.push(minMatches, limit);

    try {
        return d.prepare(sql).all(...params);
    } catch (err) {
        console.error('[db] plotKeywordSearch error:', err.message);
        return [];
    }
}

/**
 * Search for works whose title_en appears as a substring in the given text.
 * Used to find works explicitly mentioned by query expansion (e.g., "A Beautiful Mind").
 * Only returns works that have plots (same filter as other search methods).
 *
 * @param {string} text - Text to search for title mentions (expanded query)
 * @param {Object} opts - { type, limit }
 * @returns {Array} Works found by title match, with sitelinks and metadata
 */
function titleMentionSearch(text, opts = {}) {
    const d = getDb();
    const { type = null, limit = 50 } = opts;

    // Get works with high sitelinks that have plots — these are the "famous" works
    // that the LLM is most likely to mention by title
    let sql = `
        SELECT w.id, w.wikidata_id, w.type, w.title_it, w.title_en,
               w.creator, w.year, w.genres, w.sitelinks, w.country
        FROM works w
        INNER JOIN plots p ON w.id = p.work_id
        WHERE w.sitelinks >= 30
    `;
    const params = [];
    if (type) {
        sql += ' AND w.type = ?';
        params.push(type);
    }
    sql += ' GROUP BY w.id ORDER BY w.sitelinks DESC LIMIT 2000';

    const candidates = d.prepare(sql).all(...params);
    const textLower = text.toLowerCase();
    const matched = [];

    for (const w of candidates) {
        // Check if an English or Italian title appears as a whole word in the text
        // Use word boundary check to avoid partial matches (e.g. "trial" in "industrial")
        const titleEn = (w.title_en || '').trim();
        if (titleEn.length >= 6) {
            const titleLower = titleEn.toLowerCase();
            const idx = textLower.indexOf(titleLower);
            if (idx >= 0) {
                // Check it's a word boundary (not part of a longer word)
                const before = idx === 0 || /[\s|,;]/.test(textLower[idx - 1]);
                const after = idx + titleLower.length >= textLower.length || /[\s|,;]/.test(textLower[idx + titleLower.length]);
                if (before && after) { matched.push(w); continue; }
            }
        }
        const titleIt = (w.title_it || '').trim();
        if (titleIt.length >= 6) {
            const titleLower = titleIt.toLowerCase();
            const idx = textLower.indexOf(titleLower);
            if (idx >= 0) {
                const before = idx === 0 || /[\s|,;]/.test(textLower[idx - 1]);
                const after = idx + titleLower.length >= textLower.length || /[\s|,;]/.test(textLower[idx + titleLower.length]);
                if (before && after) matched.push(w);
            }
        }
    }

    return matched.slice(0, limit);
}

// --- Meta (DB versioning) ---

function getMeta(key) {
    return getStmt('getMeta', 'SELECT value FROM meta WHERE key = ?').get(key)?.value || null;
}

function setMeta(key, value) {
    getStmt('setMeta', `
        INSERT INTO meta (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
    `).run(key, String(value));
}

function getAllMeta() {
    return getDb().prepare('SELECT key, value, updated_at FROM meta ORDER BY key').all();
}

module.exports = {
    getDb,
    close,
    // Works
    upsertWork,
    getWorkById,
    getWorkByWikidataId,
    getWorkCount,
    // Plots
    insertPlot,
    getPlots,
    getPlotsBatch,
    getPlotCount,
    // Embeddings
    insertEmbedding,
    vectorSearch,
    vectorSearchWithPlots,
    // FTS5 / BM25
    textSearch,
    bm25Search,
    rebuildFtsIndex,
    // Advanced search
    plotKeywordSearch,
    titleMentionSearch,
    // Enrichments
    upsertEnrichment,
    getEnrichmentsBatch,
    // Meta (DB versioning)
    getMeta,
    setMeta,
    getAllMeta,
    // Stats
    getStats,
    // Constants
    EMBEDDING_DIM,
    DB_PATH
};
