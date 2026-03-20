/**
 * Inspire v2 - Multi-Tier Title Matching Utilities
 *
 * Tier 1 - Wikidata ID (confidence 1.00)
 * Tier 2 - Wikipedia API -> Wikidata ID (confidence 0.95)
 * Tier 3 - Fuzzy title + year + creator (confidence 0.70-0.85)
 * Tier 4 - Normalized title only (confidence 0.50-0.65)
 */

'use strict';

const WIKI_API_BASE = 'https://en.wikipedia.org/w/api.php';
const RATE_LIMIT_MS = 200;

async function resolveWikipediaTitles(titles) {
    const result = new Map();
    if (!titles.length) return result;
    const BATCH = 50;
    for (let i = 0; i < titles.length; i += BATCH) {
        const batch = titles.slice(i, i + BATCH);
        const titlesParam = batch.join('|');
        const url = `${WIKI_API_BASE}?action=query&prop=pageprops&ppprop=wikibase_item` +
            `&titles=${encodeURIComponent(titlesParam)}&format=json&redirects=1&formatversion=2`;
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'InspireMeBot/2.0 (https://github.com/USER/InspireMe)',
                    'Accept': 'application/json'
                },
                signal: AbortSignal.timeout(30000)
            });
            if (!res.ok) { console.error(`  Warning: Wikipedia API ${res.status}`); continue; }
            const data = await res.json();
            const redirectMap = {};
            if (data.query?.redirects) {
                for (const r of data.query.redirects) redirectMap[r.from] = r.to;
            }
            const normalizedMap = {};
            if (data.query?.normalized) {
                for (const n of data.query.normalized) normalizedMap[n.from] = n.to;
            }
            if (data.query?.pages) {
                for (const page of data.query.pages) {
                    if (page.missing) continue;
                    const qid = page.pageprops?.wikibase_item;
                    if (!qid) continue;
                    const pageTitle = page.title;
                    result.set(pageTitle, qid);
                    for (const [from, to] of Object.entries(redirectMap)) {
                        if (to === pageTitle) result.set(from, qid);
                    }
                    for (const [from, to] of Object.entries(normalizedMap)) {
                        if (to === pageTitle) result.set(from, qid);
                    }
                }
            }
        } catch (err) {
            console.error(`  Warning: Wikipedia API error: ${err.message}`);
        }
        if (i + BATCH < titles.length) await sleep(RATE_LIMIT_MS);
    }
    return result;
}

function levenshtein(a, b) {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    let curr = new Array(b.length + 1);
    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[b.length];
}

function levenshteinSimilarity(a, b) {
    if (!a || !b) return 0;
    const dist = levenshtein(a.toLowerCase(), b.toLowerCase());
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1.0 : 1.0 - dist / maxLen;
}

function normalizeTitle(title) {
    if (!title) return '';
    return title
        .replace(/\s*\((?:film|movie|novel|book|short story|play|TV series|miniseries|\d{4}\s*(?:film|movie)?)(?:\s*\))?\s*/gi, '')
        .replace(/\s*\([^)]*\)\s*$/, '')
        .replace(/^(the|a|an|il|lo|la|i|gli|le|l'|un|uno|una)\s+/i, '')
        .replace(/['\u2018\u2019`]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function buildWorksIndex(dbModule) {
    const d = dbModule.getDb();
    const works = d.prepare('SELECT id, wikidata_id, type, title_en, title_it, title_orig, year, creator FROM works').all();
    return works.map(w => ({
        id: w.id, wikidata_id: w.wikidata_id, type: w.type,
        title_en: w.title_en, title_it: w.title_it, year: w.year, creator: w.creator,
        normTitle: normalizeTitle(w.title_en || w.title_it || w.title_orig || ''),
        normTitleIt: normalizeTitle(w.title_it || ''),
        normTitleOrig: normalizeTitle(w.title_orig || '')
    }));
}

function fuzzyMatch(candidate, worksIndex) {
    const normTitle = normalizeTitle(candidate.title);
    if (!normTitle || normTitle.length < 2) return null;
    let bestMatch = null, bestScore = 0;
    for (const entry of worksIndex) {
        const titleSim = levenshteinSimilarity(normTitle, entry.normTitle);
        if (titleSim < 0.75) continue;
        let score = titleSim, bonuses = 0;
        if (candidate.year && entry.year) {
            if (candidate.year === entry.year) bonuses += 0.10;
            else if (Math.abs(candidate.year - entry.year) <= 1) bonuses += 0.05;
        }
        if (candidate.creator && entry.creator) {
            if (levenshteinSimilarity(candidate.creator.toLowerCase(), entry.creator.toLowerCase()) > 0.7)
                bonuses += 0.10;
        }
        const totalScore = Math.min(score + bonuses, 0.95);
        if (totalScore > bestScore) { bestScore = totalScore; bestMatch = entry; }
    }
    if (!bestMatch || bestScore < 0.75) return null;
    let confidence;
    if (bestScore >= 0.95) confidence = 0.85;
    else if (bestScore >= 0.90) confidence = 0.80;
    else if (bestScore >= 0.85) confidence = 0.75;
    else confidence = 0.70;
    return { work: bestMatch, confidence };
}

function exactNormalizedMatch(title, worksIndex) {
    const norm = normalizeTitle(title);
    if (!norm || norm.length < 2) return null;
    for (const entry of worksIndex) {
        if (entry.normTitle === norm || entry.normTitleIt === norm || entry.normTitleOrig === norm)
            return { work: entry, confidence: 0.60 };
    }
    return null;
}

async function multiTierMatch(opts) {
    const { entries, db: dbModule, worksIndex, useWikipediaApi = true } = opts;
    const matched = [], unmatched = [];
    // Tier 1: Direct Wikidata ID
    const remainingAfterT1 = [];
    let t1 = 0;
    for (const entry of entries) {
        if (entry.wikidata_id) {
            const work = dbModule.getWorkByWikidataId(entry.wikidata_id);
            if (work) { matched.push({ entry, work_id: work.id, confidence: 1.0, tier: 1 }); t1++; continue; }
        }
        remainingAfterT1.push(entry);
    }
    if (t1 > 0) console.log(`    [Tier 1] ${t1} matched by Wikidata ID`);
    // Tier 2: Wikipedia API
    const remainingAfterT2 = [];
    if (useWikipediaApi && remainingAfterT1.length > 0) {
        const titlesToResolve = remainingAfterT1.map(e => e.wikipedia_title || e.title).filter(Boolean);
        if (titlesToResolve.length > 0) {
            const wikiMap = await resolveWikipediaTitles(titlesToResolve);
            let t2 = 0;
            for (const entry of remainingAfterT1) {
                const lookupTitle = entry.wikipedia_title || entry.title;
                const qid = wikiMap.get(lookupTitle);
                if (qid) {
                    const work = dbModule.getWorkByWikidataId(qid);
                    if (work) { matched.push({ entry, work_id: work.id, confidence: 0.95, tier: 2 }); t2++; continue; }
                }
                remainingAfterT2.push(entry);
            }
            if (t2 > 0) console.log(`    [Tier 2] ${t2} matched via Wikipedia API`);
        } else { remainingAfterT2.push(...remainingAfterT1); }
    } else { remainingAfterT2.push(...remainingAfterT1); }
    // Tier 3: Fuzzy
    const remainingAfterT3 = [];
    let t3 = 0;
    for (const entry of remainingAfterT2) {
        const result = fuzzyMatch({ title: entry.title, year: entry.year ? parseInt(entry.year) : null, creator: entry.creator || entry.author || entry.director || null }, worksIndex);
        if (result) { matched.push({ entry, work_id: result.work.id, confidence: result.confidence, tier: 3 }); t3++; }
        else remainingAfterT3.push(entry);
    }
    if (t3 > 0) console.log(`    [Tier 3] ${t3} matched by fuzzy title+year+creator`);
    // Tier 4: Normalized exact
    let t4 = 0;
    for (const entry of remainingAfterT3) {
        const result = exactNormalizedMatch(entry.title, worksIndex);
        if (result) { matched.push({ entry, work_id: result.work.id, confidence: result.confidence, tier: 4 }); t4++; }
        else unmatched.push(entry);
    }
    if (t4 > 0) console.log(`    [Tier 4] ${t4} matched by normalized title`);
    console.log(`    -- Total: ${matched.length} matched, ${unmatched.length} unmatched --`);
    return { matched, unmatched };
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

module.exports = { resolveWikipediaTitles, levenshtein, levenshteinSimilarity, fuzzyMatch,
    normalizeTitle, buildWorksIndex, exactNormalizedMatch, multiTierMatch };
