/**
 * Build Pipeline Orchestrator
 *
 * Runs all build steps in sequence to create inspire.db from scratch.
 *
 * Prerequisites:
 *   - Ollama running with nomic-embed-text-v2-moe pulled
 *   - Wikipedia dumps extracted with wikiextractor (optional, for WikiPlots)
 *   - Tell Me Again! dataset downloaded (optional)
 *
 * Usage: node build/build-all.js [options]
 *
 * Options:
 *   --skip-wikidata        Skip Wikidata fetch (use existing works)
 *   --skip-wikiplots       Skip WikiPlots extraction
 *   --skip-tellmeagain     Skip Tell Me Again! import
 *   --skip-embeddings      Skip embedding generation
 *   --skip-fts             Skip FTS5 index rebuild
 *   --wikiplots-en <path>  Path to EN wikiextractor output
 *   --wikiplots-it <path>  Path to IT wikiextractor output
 *   --tellmeagain <path>   Path to Tell Me Again! data
 *   --min-sitelinks <n>    Min sitelinks for Wikidata (default: 5)
 *   --compress             Compress output to inspire.db.gz
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const db = require('../db');

// ─── Parse Arguments ─────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
};

const SKIP_WIKIDATA = flag('skip-wikidata');
const SKIP_WIKIPLOTS = flag('skip-wikiplots');
const SKIP_TELLMEAGAIN = flag('skip-tellmeagain');
const SKIP_EMBEDDINGS = flag('skip-embeddings');
const SKIP_FTS = flag('skip-fts');
const COMPRESS = flag('compress');

const WIKIPLOTS_EN = opt('wikiplots-en', null);
const WIKIPLOTS_IT = opt('wikiplots-it', null);
const TELLMEAGAIN_PATH = opt('tellmeagain', null);
const MIN_SITELINKS = opt('min-sitelinks', '5');

// ─── Helpers ─────────────────────────────────────────────────────

function runStep(label, command) {
    console.log(`\n${'═'.repeat(50)}`);
    console.log(` ${label}`);
    console.log('═'.repeat(50));

    try {
        execSync(command, {
            stdio: 'inherit',
            cwd: __dirname,
            env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' }
        });
        console.log(`✅ ${label} — completed`);
    } catch (err) {
        console.error(`❌ ${label} — FAILED`);
        throw err;
    }
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// ─── Main ────────────────────────────────────────────────────────

async function buildAll() {
    const startTime = Date.now();

    console.log('');
    console.log('  ✦ INSPIRE v2 — Full Database Build');
    console.log('  ══════════════════════════════════════');
    console.log(`  DB path:        ${db.DB_PATH}`);
    console.log(`  Min sitelinks:  ${MIN_SITELINKS}`);
    console.log(`  WikiPlots EN:   ${WIKIPLOTS_EN || '(skipped)'}`);
    console.log(`  WikiPlots IT:   ${WIKIPLOTS_IT || '(skipped)'}`);
    console.log(`  Tell Me Again:  ${TELLMEAGAIN_PATH || '(skipped)'}`);
    console.log(`  Compress:       ${COMPRESS}`);
    console.log('');

    // Ensure data directory exists
    const dataDir = path.dirname(db.DB_PATH);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    // ─── Step 1: Wikidata ────────────────────────────────────

    if (!SKIP_WIKIDATA) {
        runStep(
            'Step 1/5: Fetch works from Wikidata',
            `node fetch-wikidata.js --min-sitelinks ${MIN_SITELINKS}`
        );
    } else {
        console.log('\n⏭ Skipping Wikidata fetch');
    }

    // ─── Step 2: WikiPlots ───────────────────────────────────

    if (!SKIP_WIKIPLOTS) {
        if (WIKIPLOTS_EN) {
            runStep(
                'Step 2a/5: Extract WikiPlots (English)',
                `node extract-wikiplots.js --input "${WIKIPLOTS_EN}" --lang en`
            );
        }
        if (WIKIPLOTS_IT) {
            runStep(
                'Step 2b/5: Extract WikiPlots (Italian)',
                `node extract-wikiplots.js --input "${WIKIPLOTS_IT}" --lang it`
            );
        }
        if (!WIKIPLOTS_EN && !WIKIPLOTS_IT) {
            console.log('\n⏭ No WikiPlots paths provided, skipping');
        }
    } else {
        console.log('\n⏭ Skipping WikiPlots extraction');
    }

    // ─── Step 3: Tell Me Again! ──────────────────────────────

    if (!SKIP_TELLMEAGAIN && TELLMEAGAIN_PATH) {
        runStep(
            'Step 3/5: Import Tell Me Again! dataset',
            `node import-tellmeagain.js --input "${TELLMEAGAIN_PATH}"`
        );
    } else {
        console.log('\n⏭ Skipping Tell Me Again! import');
    }

    // ─── Step 4: Embeddings ──────────────────────────────────

    if (!SKIP_EMBEDDINGS) {
        runStep(
            'Step 4/5: Generate embeddings',
            'node generate-embeddings.js'
        );
    } else {
        console.log('\n⏭ Skipping embedding generation');
    }

    // ─── Step 5: FTS5 Index ──────────────────────────────────

    if (!SKIP_FTS) {
        console.log(`\n${'═'.repeat(50)}`);
        console.log(' Step 5/5: Rebuild FTS5 index');
        console.log('═'.repeat(50));

        db.getDb();
        db.rebuildFtsIndex();
        db.close();
        console.log('✅ FTS5 index rebuilt');
    } else {
        console.log('\n⏭ Skipping FTS5 rebuild');
    }

    // ─── Summary ─────────────────────────────────────────────

    db.getDb();
    const stats = db.getStats();
    const dbSize = fs.statSync(db.DB_PATH).size;
    db.close();

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log('\n');
    console.log('  ✦ BUILD COMPLETE');
    console.log('  ══════════════════════════════════════');
    console.log(`  📚 Books:        ${stats.books}`);
    console.log(`  🎬 Movies:       ${stats.movies}`);
    console.log(`  📝 Plots EN:     ${stats.with_plots_en}`);
    console.log(`  📝 Plots IT:     ${stats.with_plots_it}`);
    console.log(`  🔢 Embeddings:   ${stats.with_embeddings}`);
    console.log(`  💾 DB size:      ${formatBytes(dbSize)}`);
    console.log(`  ⏱ Total time:   ${elapsed} min`);

    // ─── Optional: Compress ──────────────────────────────────

    if (COMPRESS) {
        console.log('\n  Compressing...');
        const zlib = require('zlib');
        const input = fs.readFileSync(db.DB_PATH);
        const compressed = zlib.gzipSync(input, { level: 9 });
        const gzPath = db.DB_PATH + '.gz';
        fs.writeFileSync(gzPath, compressed);
        console.log(`  📦 Compressed: ${formatBytes(compressed.length)} → ${gzPath}`);
    }

    console.log('\n  Done! 🎉\n');
}

if (require.main === module) {
    buildAll().catch(err => {
        console.error('\n❌ Build failed:', err.message);
        db.close();
        process.exit(1);
    });
}

module.exports = { buildAll };
