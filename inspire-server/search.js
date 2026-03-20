/**
 * Inspire v2 — Hybrid RAG Search (Vector + BM25 + RRF)
 *
 * Architecture:
 *  1. Generate query embedding via Ollama
 *  2. Vector search (semantic similarity) — only works WITH plots
 *  3. BM25 search (keyword relevance via FTS5) — only works WITH plots
 *  4. Reciprocal Rank Fusion (RRF) to merge both result sets
 *  5. Return results with pre-computed enrichments (no LLM at runtime)
 */

'use strict';

const path = require('path');
const db = require('./db');

// --- Configuration ---

const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'qwen3-embedding:4b';
const LLM_MODEL = process.env.LLM_MODEL || 'qwen3.5:4b';
const ENABLE_QUERY_EXPANSION = process.env.DISABLE_QUERY_EXPANSION !== '1'; // enabled by default

// RRF fusion parameter (standard value, balances both signals)
const RRF_K = 60;

// Confidence thresholds (based on similarity + popularity + RRF)
// Rebalanced: similarity dominates, popularity is secondary
const THRESHOLD_GREEN  = 0.45;
const THRESHOLD_YELLOW = 0.28;

// --- Concept Map (loaded from external JSON) ---

const CONCEPT_TO_PLOT_KEYWORDS = JSON.parse(
    require('fs').readFileSync(
        path.join(__dirname, 'data', 'concept-map.json'), 'utf8'
    )
);

// --- LRU Cache for Query Expansion ---

class LRUCache {
    constructor(maxSize = 50) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return undefined;
        const value = this.cache.get(key);
        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key, value) {
        if (this.cache.has(key)) this.cache.delete(key);
        this.cache.set(key, value);
        if (this.cache.size > this.maxSize) {
            // Delete oldest (first) entry
            const oldest = this.cache.keys().next().value;
            this.cache.delete(oldest);
        }
    }
}

const expansionCache = new LRUCache(100);

// --- Ollama Embedding ---

async function getEmbedding(text) {
    const res = await fetch(`${OLLAMA_BASE}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: text })
    });

    if (!res.ok) {
        throw new Error(`Ollama embed error: ${res.status}`);
    }

    const data = await res.json();
    if (data.embeddings && data.embeddings[0]) return data.embeddings[0];
    if (data.embedding) return data.embedding;
    throw new Error('No embedding returned');
}

// --- LLM Query Expansion (Structured JSON) ---

/**
 * Use Qwen 3.5 to reason about what the user really needs,
 * then return a structured expansion with keywords AND exclude_genres.
 *
 * Returns: { keywords: string, exclude_genres: string[] }
 */
async function expandQuery(userQuery, type = null, safeMode = false) {
    if (!ENABLE_QUERY_EXPANSION) return { keywords: userQuery, exclude_genres: [] };

    // Check cache first (normalized key — includes safe_mode so results differ)
    const cacheKey = `${userQuery.toLowerCase().trim()}|${type || 'all'}|${safeMode ? 'safe' : 'open'}`;
    const cached = expansionCache.get(cacheKey);
    if (cached) {
        console.log(`[query-expansion] Cache hit for "${userQuery.substring(0, 50)}"`);
        return cached;
    }

    const typeHint = type === 'book' ? 'libri' : type === 'movie' ? 'film' : 'opere (libri e film)';

    const prompt = `Sei un consulente empatico italiano di letteratura e cinema. Il tuo compito è CAPIRE COSA CERCA DAVVERO L'UTENTE a livello emotivo e pratico, poi generare parole chiave per trovare ${typeHint} che rispondano al suo bisogno.

RICHIESTA DELL'UTENTE:
"${userQuery}"

PASSO 1 — COMPRENDI L'INTENTO EMOTIVO:
Chiediti: cosa vuole OTTENERE l'utente? Vuole:
- SUPERARE qualcosa? → cerca storie di coraggio, riscatto, crescita, vittoria
- COMPRENDERE qualcosa? → cerca storie che esplorino quel mondo, quell'epoca, quel tema
- DIVERTIRSI? → cerca storie leggere, comiche, avventurose
- ISPIRARSI? → cerca storie motivazionali, di trasformazione, di successo
- ELABORARE UN'EMOZIONE? → cerca storie che affrontino quell'emozione con sensibilità

PASSO 2 — GENERA OUTPUT JSON:
Rispondi SOLO con un oggetto JSON valido, nient'altro. Formato:
{
  "keywords": "parola1 parola2 ... parola30-50 (italiano E inglese, separate da spazi)",
  "exclude_genres": ["genere1", "genere2"],
  "suggested_titles": ["Titolo1", "Titolo2"]
}

REGOLE PER keywords:
- MASSIMO 30 parole, separate da spazi, NESSUNA frase
- Solo parole singole: "musica pianoforte talento passione" — NON frasi intere
- NON concentrarti solo sul problema ma soprattutto sulla SOLUZIONE e sul PERCORSO POSITIVO
- Parole in italiano E inglese

REGOLE PER exclude_genres (CRITICO):
- Se l'utente vuole SUPERARE una paura → escludi ["Horror", "Thriller"]
- Se l'utente cerca contenuti per bambini → escludi ["Horror", "Thriller", "Crime film"]
- Se l'utente cerca romanticismo → escludi ["Horror", "War film"]
- Se l'intento è positivo/costruttivo → escludi generi cupi/violenti
- Se l'utente cerca esplicitamente un genere (es. "film horror"), NON escluderlo
- Lascia vuoto [] se non serve escludere nulla

REGOLE PER suggested_titles:
- Solo titoli reali e famosi (che sei CERTO esistano)
- Massimo 5 titoli
- Se non sei sicuro, lascia vuoto []

${safeMode ? `MODALITÀ SICURA ATTIVA:
- L'utente ha attivato la modalità "per famiglie/bambini"
- Privilegia titoli Disney, Pixar, DreamWorks, Studio Ghibli, Illumination, classici per ragazzi
- Privilegia film/libri adatti a tutte le età, con messaggio positivo
- Escludi SEMPRE almeno: ["Horror", "Thriller", "Crime film", "Erotic"]
- Pensa a grandi successi family: Mamma ho perso l'aereo, E.T., Inside Out, Il Re Leone, Harry Potter, ecc.
- Le keywords devono orientarsi verso avventura, magia, amicizia, scoperta, crescita

` : ''}ATTENZIONE AGLI IDIOMI ITALIANI:
- "gioco di società" = gioco da tavolo, NON "gioco sociale"
- "vita di società" = vita mondana, alta società
- "il bel paese" = Italia
- Interpreta SEMPRE nel contesto italiano corretto

Esempio:
Richiesta: "Aiutami a superare la paura del buio"
{"keywords": "coraggio buio luce speranza vincere paura bambino notte rassicurazione crescita interiore affrontare mostri immaginari forza interiore brave darkness overcome fear courage light hope child night reassurance","exclude_genres": ["Horror", "Thriller"],"suggested_titles": ["Monsters & Co.", "Coraline", "Peter Pan"]}

Rispondi SOLO con il JSON:`;

    try {
        const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: LLM_MODEL,
                messages: [{ role: 'user', content: prompt }],
                stream: false,
                think: false,
                options: {
                    temperature: 0.3,
                    num_predict: 500,
                    num_ctx: 2048,
                    top_p: 0.85
                }
            }),
            signal: AbortSignal.timeout(90000)
        });

        if (!res.ok) throw new Error(`LLM status ${res.status}`);
        const data = await res.json();
        let raw = (data.message?.content || '').trim();

        // Clean markdown code fences if present
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

        const parsed = parseJsonRobust(raw);
        const result = {
            keywords: typeof parsed.keywords === 'string' ? `${userQuery} ${parsed.keywords}` : userQuery,
            exclude_genres: Array.isArray(parsed.exclude_genres) ? parsed.exclude_genres : [],
            suggested_titles: Array.isArray(parsed.suggested_titles) ? parsed.suggested_titles : []
        };

        console.log(`[query-expansion] "${userQuery}" → ${result.keywords.substring(0, 100)}... | exclude: [${result.exclude_genres.join(', ')}]`);

        // Cache the result
        expansionCache.set(cacheKey, result);
        return result;

    } catch (err) {
        console.warn(`[query-expansion] Failed (${err.message}), using fallback`);

        // Fallback: try to parse as plain text (backward compat)
        const fallback = { keywords: userQuery, exclude_genres: [], suggested_titles: [] };
        expansionCache.set(cacheKey, fallback);
        return fallback;
    }
}

// --- Bilingual Plot Keyword Extraction ---

function extractPlotKeywords(originalQuery, expandedQuery) {
    const combined = (originalQuery + ' ' + expandedQuery).toLowerCase();
    const keywordsSet = new Set();

    for (const [stem, plotWords] of Object.entries(CONCEPT_TO_PLOT_KEYWORDS)) {
        if (combined.includes(stem)) {
            for (const pw of plotWords) {
                keywordsSet.add(pw);
            }
        }
    }

    return [...keywordsSet];
}

async function checkOllama() {
    try {
        const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
            signal: AbortSignal.timeout(3000)
        });
        const data = await res.json();
        const models = (data.models || []).map(m => m.name);
        return {
            available: true,
            has_embedding_model: models.some(m => m.includes('qwen3-embedding')),
            models
        };
    } catch (err) {
        return { available: false, reason: err.message };
    }
}

// --- Safe Mode Configuration ---

// Genres always excluded when safe_mode is on
const SAFE_MODE_EXCLUDE_GENRES = ['Horror', 'Thriller', 'Crime film', 'Erotic', 'Slasher', 'Splatter'];

// Genres that get a confidence boost when safe_mode is on
const SAFE_MODE_BOOST_GENRES = [
    'animated film', 'family film', "children's film", 'adventure film',
    'comedy film', 'fantasy film', 'musical film', 'Christmas film'
];

// Studios/keywords in creator/title that signal family-friendly content
const SAFE_MODE_BOOST_CREATORS = [
    'disney', 'pixar', 'dreamworks', 'ghibli', 'illumination', 'aardman', 'laika',
    'roald dahl', 'j.k. rowling', 'c.s. lewis', 'astrid lindgren'
];

// --- Genre Filter ---

/**
 * Check if a work's genres match any of the excluded genres.
 * Uses case-insensitive partial matching.
 */
function matchesExcludedGenre(workGenres, excludeGenres) {
    if (!excludeGenres || excludeGenres.length === 0) return false;
    const genreStr = (typeof workGenres === 'string' ? workGenres : JSON.stringify(workGenres)).toLowerCase();
    return excludeGenres.some(eg => genreStr.includes(eg.toLowerCase()));
}

/**
 * Check if a work matches family-friendly / safe mode boost criteria.
 * Returns a multiplier: 1.0 (no boost), up to 1.4 for strong matches.
 */
function safeModeBoost(result) {
    const genreStr = (typeof result.genres === 'string' ? result.genres : JSON.stringify(result.genres || [])).toLowerCase();
    const creator = (result.creator || '').toLowerCase();
    const titleIt = (result.title_it || '').toLowerCase();
    const titleEn = (result.title_en || '').toLowerCase();

    let boost = 1.0;

    // Genre boost: animated/family/children's films get a bump
    const genreMatches = SAFE_MODE_BOOST_GENRES.filter(g => genreStr.includes(g)).length;
    if (genreMatches >= 2) boost += 0.25;       // strong family signal (e.g. "animated film" + "family film")
    else if (genreMatches >= 1) boost += 0.15;  // moderate signal

    // Creator/studio boost
    const creatorMatch = SAFE_MODE_BOOST_CREATORS.some(c =>
        creator.includes(c) || titleIt.includes(c) || titleEn.includes(c)
    );
    if (creatorMatch) boost += 0.15;

    return Math.min(boost, 1.4); // cap at 1.4x
}

// --- Reciprocal Rank Fusion ---

function reciprocalRankFusion(lists, labels = [], k = RRF_K) {
    const scores = new Map();
    const dataMap = new Map();
    const rankInfo = new Map();

    lists.forEach((list, listIdx) => {
        const label = labels[listIdx] || `list${listIdx}`;
        list.forEach((item, rank) => {
            const rrfScore = 1.0 / (k + rank + 1);
            scores.set(item.id, (scores.get(item.id) || 0) + rrfScore);

            if (!dataMap.has(item.id)) {
                dataMap.set(item.id, { ...item });
                rankInfo.set(item.id, {});
            }

            const info = rankInfo.get(item.id);
            if (label === 'vec') info._vec_rank = rank + 1;
            else if (label === 'bm25') info._bm25_rank = rank + 1;
            else if (label === 'title') info._title_match = true;
            else if (label === 'plot') info._plot_match_count = item.match_count || 0;
            info[`_${label}_rank`] = rank + 1;
        });
    });

    const merged = [];
    for (const [id, rrfScore] of scores) {
        const data = dataMap.get(id);
        const info = rankInfo.get(id);
        merged.push({
            ...data,
            rrf_score: rrfScore,
            _vec_rank: info._vec_rank || null,
            _bm25_rank: info._bm25_rank || null,
            _title_match: info._title_match || false,
            _plot_match_count: info._plot_match_count || 0,
            _agreement: (info._vec_rank && info._bm25_rank) ? true : false
        });
    }

    merged.sort((a, b) => b.rrf_score - a.rrf_score);
    return merged;
}

// --- Confidence Scoring ---

function computeConfidence(result) {
    const rrf = result.rrf_score || 0;
    const popularityNorm = Math.min((result.sitelinks || 0) / 100, 1.0);
    const titleMatch = result._title_match ? 1.0 : 0.0;
    const plotMatchCount = result._plot_match_count || 0;

    let similarity = result.similarity || 0;
    // Only give synthetic similarity for plot-only matches if they also have agreement or title match
    if (similarity === 0 && plotMatchCount >= 3) {
        similarity = Math.min(0.15 + plotMatchCount * 0.02, 0.30);
    }

    const maxRrf = 4.0 / (RRF_K + 1);
    const rrfNorm = Math.min(rrf / maxRrf, 1.0);

    // Rebalanced: semantic similarity matters most, popularity is a tiebreaker
    let base = (
        similarity     * 0.45 +
        popularityNorm * 0.15 +
        rrfNorm        * 0.40
    );

    // Agreement bonus: found by BOTH vector AND text search → more trustworthy
    const agreement = result._agreement ? 1.0 : 0.0;
    base += agreement * 0.08;

    // Plot keyword match bonus: direct thematic evidence
    if (plotMatchCount >= 3) base += 0.06;
    else if (plotMatchCount >= 1) base += 0.03;

    return base + titleMatch * 0.15;
}

function classifyConfidence(score) {
    if (score >= THRESHOLD_GREEN)  return 'verified';
    if (score >= THRESHOLD_YELLOW) return 'verify_online';
    return 'hidden';
}

// --- Main Search ---

async function search(params = {}) {
    const startTime = Date.now();
    const {
        query,
        type = 'all',
        limit = 12,
        safe_mode = false
    } = params;

    if (!query || query.trim().length === 0) {
        return { results: [], total_found: 0, search_time_ms: 0 };
    }

    const searchType = type === 'all' ? null : type;
    const candidateLimit = 200;
    const searchOpts = { type: searchType, limit: candidateLimit };

    // Step 0: Query Expansion (structured JSON) + BM25 on original query (parallel)
    const [expansion, bm25Original] = await Promise.all([
        expandQuery(query, searchType, safe_mode),
        Promise.resolve(db.bm25Search(query, searchOpts))
    ]);

    const expandedQuery = expansion.keywords;
    const excludeGenres = expansion.exclude_genres;

    // Step 1: Vector search — run BOTH original and expanded queries
    let vecResults = [];
    try {
        const origVec = await getEmbedding(query);
        const vecOriginal = db.vectorSearchWithPlots(origVec, searchOpts);

        if (expandedQuery !== query) {
            const expVec = await getEmbedding(expandedQuery);
            const vecExpanded = db.vectorSearchWithPlots(expVec, searchOpts);

            const vecSeen = new Map();
            vecOriginal.forEach((item, rank) => {
                vecSeen.set(item.id, { item: { ...item }, rank });
            });
            vecExpanded.forEach((item, rank) => {
                if (!vecSeen.has(item.id)) {
                    vecSeen.set(item.id, { item: { ...item }, rank });
                } else {
                    const existing = vecSeen.get(item.id);
                    if (rank < existing.rank) {
                        vecSeen.set(item.id, { item: { ...item }, rank });
                    }
                }
            });

            vecResults = [...vecSeen.values()]
                .sort((a, b) => a.rank - b.rank)
                .map(v => v.item);
        } else {
            vecResults = vecOriginal;
        }
    } catch (err) {
        console.error('[search] Vector search failed:', err.message);
    }

    // Step 2: BM25 — merge original (already done) + expanded
    const bm25Expanded = db.bm25Search(expandedQuery, searchOpts);

    const bm25Seen = new Set();
    const bm25Results = [];
    for (const r of bm25Original) {
        if (!bm25Seen.has(r.id)) { bm25Seen.add(r.id); bm25Results.push(r); }
    }
    for (const r of bm25Expanded) {
        if (!bm25Seen.has(r.id)) { bm25Seen.add(r.id); bm25Results.push(r); }
    }

    // Step 2b: Title mention search — ONLY from explicit suggested_titles (not from expanded keywords)
    const suggestedTitles = expansion.suggested_titles || [];
    let titleResults = [];
    if (suggestedTitles.length > 0) {
        // Search only for the specific titles the LLM suggested
        const titleSearchText = suggestedTitles.join(' | ');
        titleResults = db.titleMentionSearch(titleSearchText, { type: searchType });
        if (titleResults.length > 0) {
            console.log(`[search] Title mentions found: ${titleResults.map(r => r.title_en || r.title_it).join(', ')} (from suggestions: ${suggestedTitles.join(', ')})`);
        }
    }

    // Step 2c: Plot keyword search
    const plotKeywords = extractPlotKeywords(query, expandedQuery);
    const plotResults = plotKeywords.length > 0
        ? db.plotKeywordSearch(plotKeywords, { type: searchType, limit: 30 })
        : [];
    if (plotResults.length > 0) {
        console.log(`[search] Plot keyword search: ${plotKeywords.length} keywords → ${plotResults.length} results`);
    }

    // Step 3: RRF fusion
    const fused = reciprocalRankFusion(
        [vecResults, bm25Results, titleResults, plotResults],
        ['vec', 'bm25', 'title', 'plot']
    );

    // Step 4: Score wide pool, THEN apply genre exclusion
    const widePool = fused.slice(0, Math.max(limit * 8, 100));

    const workIds = widePool.map(r => r.id);
    const plotsMap = db.getPlotsBatch(workIds);
    const enrichMap = db.getEnrichmentsBatch(workIds, 'it');

    // Step 5: Build scored results with enrichments + genre filter
    const scored = widePool.map(result => {
        const confidence = computeConfidence(result);
        const badge = classifyConfidence(confidence);
        const plots = plotsMap[result.id] || {};
        const bestPlot = plots.it || plots.en || null;
        const enrichment = enrichMap[result.id] || null;

        return {
            id: result.id,
            wikidata_id: result.wikidata_id,
            type: result.type,
            title_it: result.title_it,
            title_en: result.title_en,
            creator: result.creator,
            year: result.year,
            genres: safeJsonParse(result.genres, []),
            sitelinks: result.sitelinks,
            country: result.country,
            similarity: round4(result.similarity || 0),
            rrf_score: round4(result.rrf_score),
            confidence: round4(confidence),
            badge,
            has_plot: !!bestPlot,
            why: enrichment?.why_text || null,
            how: enrichment?.how_text || null,
            themes: enrichment ? safeJsonParse(enrichment.themes, []) : [],
            plot_short: bestPlot?.plot_short || null,
            plot_text: bestPlot?.plot_text || null,
            plot_lang: bestPlot?.language || null,
            _vec_rank: result._vec_rank,
            _bm25_rank: result._bm25_rank,
            _title_match: result._title_match || false,
            _plot_match_count: result._plot_match_count || 0,
            _agreement: result._agreement,
            _excluded: false
        };
    });

    // Merge genre exclusions: LLM-driven + safe_mode forced
    const allExcludeGenres = [...excludeGenres];
    if (safe_mode) {
        for (const g of SAFE_MODE_EXCLUDE_GENRES) {
            if (!allExcludeGenres.some(eg => eg.toLowerCase() === g.toLowerCase())) {
                allExcludeGenres.push(g);
            }
        }
    }

    // Apply exclude_genres filter — demote rather than remove entirely
    if (allExcludeGenres.length > 0) {
        for (const r of scored) {
            if (matchesExcludedGenre(r.genres, allExcludeGenres)) {
                r.confidence = round4(r.confidence * 0.4);
                r.badge = classifyConfidence(r.confidence);
                r._excluded = true;
            }
        }
        console.log(`[search] Genre exclusion applied: [${allExcludeGenres.join(', ')}] — ${scored.filter(r => r._excluded).length} demoted`);
    }

    // Apply safe_mode boost — family-friendly content gets promoted
    if (safe_mode) {
        let boostedCount = 0;
        for (const r of scored) {
            if (r._excluded) continue; // don't boost excluded results
            const boost = safeModeBoost(r);
            if (boost > 1.0) {
                r.confidence = round4(r.confidence * boost);
                r.badge = classifyConfidence(r.confidence);
                boostedCount++;
            }
        }
        console.log(`[search] Safe mode boost applied: ${boostedCount} results boosted`);
    }

    const filtered = scored.filter(r => r.badge !== 'hidden');

    const badgeOrder = { 'verified': 1, 'verify_online': 2 };
    filtered.sort((a, b) => {
        const badgeDiff = (badgeOrder[a.badge] || 99) - (badgeOrder[b.badge] || 99);
        if (badgeDiff !== 0) return badgeDiff;
        return b.confidence - a.confidence;
    });

    // Deduplicate: same title_it (or title_en) + same year + same type → keep highest confidence
    const deduped = [];
    const seenKeys = new Set();
    for (const r of filtered) {
        const title = (r.title_it || r.title_en || '').toLowerCase().trim();
        const key = `${title}|${r.year || ''}|${r.type || ''}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        deduped.push(r);
    }

    const finalResults = deduped.slice(0, limit);

    return {
        results: finalResults,
        total_found: fused.length,
        search_time_ms: Date.now() - startTime,
        expanded_query: expandedQuery !== query ? expandedQuery : null,
        excluded_genres: allExcludeGenres.length > 0 ? allExcludeGenres : undefined,
        safe_mode
    };
}

// --- Helpers ---

/**
 * Robustly parse JSON from LLM output — handles truncated strings.
 * If standard parse fails, extracts fields via regex.
 */
function parseJsonRobust(raw) {
    // Try standard parse first
    try { return JSON.parse(raw); } catch {}

    // Truncated JSON recovery: extract what we can with regex
    const result = {};

    // Extract keywords (first quoted string after "keywords")
    const kwMatch = raw.match(/"keywords"\s*:\s*"([^"]*)/);
    if (kwMatch) result.keywords = kwMatch[1].trim();

    // Extract exclude_genres array
    const exMatch = raw.match(/"exclude_genres"\s*:\s*\[([^\]]*)/);
    if (exMatch) {
        result.exclude_genres = exMatch[1]
            .split(',')
            .map(s => s.trim().replace(/^"|"$/g, ''))
            .filter(s => s.length > 0);
    }

    // Extract suggested_titles array
    const titMatch = raw.match(/"suggested_titles"\s*:\s*\[([^\]]*)/);
    if (titMatch) {
        result.suggested_titles = titMatch[1]
            .split(',')
            .map(s => s.trim().replace(/^"|"$/g, ''))
            .filter(s => s.length > 0);
    }

    if (result.keywords || result.exclude_genres || result.suggested_titles) {
        console.log('[query-expansion] Recovered truncated JSON via regex');
        return result;
    }

    throw new Error('Cannot parse LLM JSON output');
}

function safeJsonParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
}

function round4(n) {
    return Math.round(n * 10000) / 10000;
}

// --- Personalized Inspire Text Generation ---

/**
 * Generate personalized "how to use for inspiration" texts.
 * Takes the user's query and a list of results with plot summaries,
 * returns a map of work_id → personalized inspire text.
 */
async function generateInspireTexts(userQuery, results) {
    if (!results || results.length === 0) return {};

    const top = results.slice(0, 3);
    const items = top.map((r, i) => {
        const plot = (r.plot_text || '').substring(0, 120).replace(/\n/g, ' ').trim();
        return `${i + 1}. "${r.title_it}" (${r.year || '?'})${plot ? ': ' + plot : ''}`;
    });

    const prompt = `Utente: "${userQuery}"

Risultati:
${items.join('\n')}

Per OGNI titolo scrivi 1 frase (max 30 parole) che spieghi perché QUESTA STORIA risponde al bisogno dell'utente. Cita personaggi o temi specifici della trama. Niente frasi generiche tipo "perfetto per una serata".

SOLO JSON: [{"id":1,"text":"..."},{"id":2,"text":"..."},{"id":3,"text":"..."}]`;

    try {
        const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: LLM_MODEL,
                messages: [{ role: 'user', content: prompt }],
                stream: false,
                think: false,
                options: {
                    temperature: 0.4,
                    num_predict: 350,
                    num_ctx: 2048,
                    top_p: 0.85
                }
            }),
            signal: AbortSignal.timeout(90000)
        });

        if (!res.ok) throw new Error(`LLM status ${res.status}`);
        const data = await res.json();
        let raw = (data.message?.content || '').trim();

        // Strip markdown fences and thinking tags
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
        raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        // Find JSON array
        const arrayStart = raw.indexOf('[');
        if (arrayStart >= 0) raw = raw.substring(arrayStart);

        console.log('[inspire] Raw LLM (first 400):', raw.substring(0, 400));

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch {
            // Recover truncated JSON
            const lastBrace = raw.lastIndexOf('}');
            if (lastBrace > 0) {
                try { parsed = JSON.parse(raw.substring(0, lastBrace + 1) + ']'); } catch {}
            }
            // Regex fallback — handles both "text" and "t" keys
            if (!parsed) {
                const objects = [];
                const re = /\{\s*"id"\s*:\s*(\d+)\s*,\s*"(?:text|t)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
                let m;
                while ((m = re.exec(raw)) !== null) {
                    objects.push({ id: parseInt(m[1]), text: m[2].replace(/\\"/g, '"') });
                }
                if (objects.length > 0) {
                    parsed = objects;
                    console.log('[inspire] Recovered via regex:', objects.length, 'items');
                } else {
                    throw new Error('Cannot parse inspire JSON');
                }
            }
        }

        // Map back to work_ids
        const inspireMap = {};
        if (Array.isArray(parsed)) {
            parsed.forEach(item => {
                const idx = (item.id || item.n || 0) - 1;
                const txt = item.text || item.t || '';
                if (idx >= 0 && idx < top.length && txt) {
                    inspireMap[top[idx].id] = txt;
                }
            });
        }

        console.log(`[inspire] Generated ${Object.keys(inspireMap).length} personalized texts in ${Math.round((data.total_duration || 0) / 1e6)}ms`);
        return inspireMap;

    } catch (err) {
        console.warn(`[inspire] Failed (${err.message}), using pre-computed fallback`);
        return {};
    }
}

// --- Exports ---

module.exports = {
    search,
    generateInspireTexts,
    getEmbedding,
    expandQuery,
    checkOllama,
    computeConfidence,
    classifyConfidence,
    EMBEDDING_MODEL,
    LLM_MODEL,
    THRESHOLD_GREEN,
    THRESHOLD_YELLOW
};
