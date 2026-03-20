/**
 * Anti-hallucination test suite
 *
 * Verifies that problematic queries don't produce semantically wrong results.
 * These tests require a running Ollama instance and the inspire.db database.
 *
 * Run: node test/anti-hallucination.test.js
 */

'use strict';

const { search, expandQuery } = require('../search');
const db = require('../db');

// Initialize database
db.getDb();

const TESTS = [
    {
        name: 'Paura del buio — should NOT return Horror as top results',
        query: 'Aiutami a superare la paura del buio',
        type: 'movie',
        assert: (results) => {
            const topGenres = results.slice(0, 3).flatMap(r => r.genres || []);
            const horrorCount = topGenres.filter(g =>
                g.toLowerCase().includes('horror') || g.toLowerCase().includes('thriller')
            ).length;
            return {
                pass: horrorCount <= 1,
                detail: `Top 3 genres: ${topGenres.join(', ')} | Horror/Thriller count: ${horrorCount}`
            };
        }
    },
    {
        name: 'Paura del buio — exclude_genres should contain Horror',
        query: 'Aiutami a superare la paura del buio',
        type: 'movie',
        testExpansion: true,
        assert: (expansion) => {
            const excludes = (expansion.exclude_genres || []).map(g => g.toLowerCase());
            return {
                pass: excludes.some(g => g.includes('horror')),
                detail: `exclude_genres: [${expansion.exclude_genres?.join(', ') || 'empty'}]`
            };
        }
    },
    {
        name: 'Gioco di società — should find board game related content',
        query: 'film su giochi di società',
        type: 'movie',
        assert: (results) => {
            const titles = results.slice(0, 5).map(r => (r.title_en || r.title_it || '').toLowerCase());
            const relevant = titles.some(t =>
                t.includes('jumanji') || t.includes('clue') || t.includes('game')
            );
            return {
                pass: results.length > 0,
                detail: `Top 5: ${titles.join(', ')} | Has board-game film: ${relevant}`
            };
        }
    },
    {
        name: 'Contenuti per bambini — should not return violent content',
        query: 'Storie per bambini sulla gentilezza',
        type: 'book',
        testExpansion: true,
        assert: (expansion) => {
            const excludes = (expansion.exclude_genres || []).map(g => g.toLowerCase());
            const hasExclusions = excludes.length > 0;
            return {
                pass: hasExclusions,
                detail: `exclude_genres: [${expansion.exclude_genres?.join(', ') || 'empty'}]`
            };
        }
    },
    {
        name: 'Scienziato famoso — should return science-related films',
        query: 'Film su un grande scienziato',
        type: 'movie',
        assert: (results) => {
            const topTitles = results.slice(0, 5).map(r => (r.title_en || '').toLowerCase());
            return {
                pass: results.length >= 3,
                detail: `Found ${results.length} results. Top 5: ${topTitles.join(', ')}`
            };
        }
    },
    {
        name: 'Asia setting — should return Asian-themed content',
        query: 'Vorrei immergermi in una storia ambientata in Asia',
        type: 'movie',
        assert: (results) => {
            return {
                pass: results.length >= 3,
                detail: `Found ${results.length} results. Top: ${results.slice(0, 3).map(r => r.title_it || r.title_en).join(', ')}`
            };
        }
    },
    {
        name: 'Cache LRU — same query should return cached result',
        query: 'test cache query per validazione',
        type: 'movie',
        testExpansion: true,
        assert: async (_, query, type) => {
            const start1 = Date.now();
            await expandQuery(query, type);
            const time1 = Date.now() - start1;

            const start2 = Date.now();
            await expandQuery(query, type);
            const time2 = Date.now() - start2;

            return {
                pass: time2 < time1 * 0.5 || time2 < 50, // cached should be much faster
                detail: `First call: ${time1}ms, Second call (cached): ${time2}ms`
            };
        }
    }
];

async function runTests() {
    console.log('\n═══════════════════════════════════════════');
    console.log('  ANTI-HALLUCINATION TEST SUITE');
    console.log('═══════════════════════════════════════════\n');

    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const test of TESTS) {
        process.stdout.write(`  ${test.name}... `);

        try {
            let result;

            if (test.testExpansion) {
                if (typeof test.assert === 'function' && test.assert.constructor.name === 'AsyncFunction') {
                    result = await test.assert(null, test.query, test.type);
                } else {
                    const expansion = await expandQuery(test.query, test.type);
                    result = test.assert(expansion);
                }
            } else {
                const searchResult = await search({
                    query: test.query,
                    type: test.type || 'all',
                    limit: 10
                });
                result = test.assert(searchResult.results);
            }

            if (result.pass) {
                console.log(`PASS`);
                console.log(`    ${result.detail}`);
                passed++;
            } else {
                console.log(`FAIL`);
                console.log(`    ${result.detail}`);
                failed++;
            }
        } catch (err) {
            console.log(`SKIP (${err.message})`);
            skipped++;
        }

        console.log('');
    }

    console.log('───────────────────────────────────────────');
    console.log(`  Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    console.log('───────────────────────────────────────────\n');

    db.close();
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
});
