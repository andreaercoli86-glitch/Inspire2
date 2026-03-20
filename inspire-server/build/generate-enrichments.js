/**
 * Inspire v2-Qwen — Generate Pre-Computed Enrichments with LLM
 *
 * Pipeline:
 *  1. Extract themes deterministically from genres + plot keywords
 *  2. Use Qwen 3.5 LLM to generate why_text and how_text in Italian
 *     - One work at a time (no cross-contamination)
 *     - Prompt is grounded on actual plot data
 *     - Output validated as JSON
 *     - Fallback to template if LLM fails
 *  3. Store enrichments in DB for instant retrieval at search time
 *
 * Quality controls:
 *  - LLM sees ONLY the real plot text (no hallucination source)
 *  - One prompt per work (prevents mixing plots)
 *  - Strict JSON validation
 *  - Automatic fallback on failure
 */

'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../db');

// --- Configuration ---

const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://localhost:11434';
const LLM_MODEL = process.env.LLM_MODEL || 'qwen3.5:4b';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '1'); // sequential for safety
const RESUME = process.argv.includes('--resume');
const LOG_FILE = path.join(__dirname, '..', '..', 'enrichments_qwen_log.txt');

// Write-through logger: writes to both console and file (unbuffered)
function log(msg) {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

// --- Theme extraction (deterministic — no LLM) ---

const THEME_KEYWORDS = {
    'amore': 'amore', 'love': 'amore', 'innamor': 'amore', 'romanc': 'amore',
    'amicizia': 'amicizia', 'friendship': 'amicizia', 'friend': 'amicizia', 'compagn': 'amicizia',
    'famiglia': 'famiglia', 'family': 'famiglia', 'father': 'famiglia', 'mother': 'famiglia',
    'padre': 'famiglia', 'madre': 'famiglia', 'figlio': 'famiglia', 'figlia': 'famiglia',
    'son': 'famiglia', 'daughter': 'famiglia', 'brother': 'famiglia', 'sister': 'famiglia',
    'avventura': 'avventura', 'adventure': 'avventura', 'journey': 'avventura', 'viaggio': 'avventura',
    'quest': 'avventura', 'expedition': 'avventura',
    'guerra': 'guerra', 'war': 'guerra', 'battle': 'guerra', 'battaglia': 'guerra', 'soldier': 'guerra',
    'magia': 'magia', 'magic': 'magia', 'wizard': 'magia', 'witch': 'magia', 'spell': 'magia', 'strega': 'magia',
    'morte': 'morte e perdita', 'death': 'morte e perdita', 'dies': 'morte e perdita', 'muore': 'morte e perdita',
    'murder': 'crimine', 'omicidio': 'crimine', 'killer': 'crimine', 'detective': 'crimine', 'crime': 'crimine',
    'polizia': 'crimine', 'police': 'crimine', 'investig': 'crimine',
    'scuola': 'crescita', 'school': 'crescita', 'student': 'crescita', 'teacher': 'crescita',
    'growing': 'crescita', 'crescit': 'crescita', 'adolescen': 'crescita',
    'coraggio': 'coraggio', 'courage': 'coraggio', 'brave': 'coraggio', 'hero': 'coraggio', 'eroe': 'coraggio',
    'potere': 'potere', 'power': 'potere', 'king': 'potere', 'queen': 'potere', 'throne': 'potere',
    'libert': 'libertà', 'freedom': 'libertà', 'escape': 'libertà', 'fuga': 'libertà', 'prison': 'libertà',
    'mare': 'mare e natura', 'sea': 'mare e natura', 'ocean': 'mare e natura', 'island': 'mare e natura',
    'isola': 'mare e natura', 'forest': 'mare e natura', 'mountain': 'mare e natura', 'natura': 'mare e natura',
    'spazio': 'fantascienza', 'space': 'fantascienza', 'planet': 'fantascienza', 'alien': 'fantascienza',
    'robot': 'fantascienza', 'future': 'fantascienza', 'futuro': 'fantascienza',
    'solitudine': 'solitudine', 'alone': 'solitudine', 'lonely': 'solitudine', 'isolation': 'solitudine',
    'redenzi': 'redenzione', 'redemption': 'redenzione', 'forgiv': 'redenzione', 'perdon': 'redenzione',
    'vendetta': 'vendetta', 'revenge': 'vendetta', 'vengeance': 'vendetta',
    'sogno': 'sogni', 'dream': 'sogni', 'immaginazione': 'sogni', 'imagination': 'sogni',
    'identit': 'identità', 'identity': 'identità', 'who am i': 'identità',
    'sopravviv': 'sopravvivenza', 'survival': 'sopravvivenza', 'survive': 'sopravvivenza',
    'umorismo': 'umorismo', 'humor': 'umorismo', 'comedy': 'umorismo', 'funny': 'umorismo', 'comico': 'umorismo',
    'fede': 'spiritualità', 'faith': 'spiritualità', 'god': 'spiritualità', 'dio': 'spiritualità', 'religion': 'spiritualità',
    'giustizi': 'giustizia', 'justice': 'giustizia', 'trial': 'giustizia', 'processo': 'giustizia',
    'regol': 'regole e disciplina', 'rule': 'regole e disciplina', 'discipline': 'regole e disciplina', 'order': 'regole e disciplina',
    'tradiment': 'tradimento', 'betrayal': 'tradimento', 'betray': 'tradimento',
    'music': 'musica e arte', 'musica': 'musica e arte', 'paint': 'musica e arte', 'artist': 'musica e arte', 'arte': 'musica e arte',
};

function extractThemes(plotText, genres) {
    const themes = new Set();
    if (genres && genres.length) {
        for (const g of genres) {
            const gl = g.toLowerCase();
            if (gl.includes('comedy') || gl.includes('commed')) themes.add('umorismo');
            if (gl.includes('drama') || gl.includes('dramm')) themes.add('dramma');
            if (gl.includes('horror')) themes.add('paura');
            if (gl.includes('thriller')) themes.add('suspense');
            if (gl.includes('romance') || gl.includes('romantico')) themes.add('amore');
            if (gl.includes('adventure') || gl.includes('avventura')) themes.add('avventura');
            if (gl.includes('fantasy')) themes.add('magia');
            if (gl.includes('science fiction') || gl.includes('fantascienza')) themes.add('fantascienza');
            if (gl.includes('war') || gl.includes('guerra')) themes.add('guerra');
            if (gl.includes('crime') || gl.includes('giallo')) themes.add('crimine');
            if (gl.includes('animation') || gl.includes('animazione')) themes.add('animazione');
            if (gl.includes('family') || gl.includes('famiglia')) themes.add('famiglia');
            if (gl.includes('musical')) themes.add('musica e arte');
            if (gl.includes('western')) themes.add('avventura');
            if (gl.includes('biography') || gl.includes('biografia')) themes.add('storia vera');
            if (gl.includes('history') || gl.includes('storico')) themes.add('storia');
            if (gl.includes('sport')) themes.add('sport');
        }
    }
    if (plotText) {
        const plotLower = plotText.toLowerCase();
        for (const [keyword, theme] of Object.entries(THEME_KEYWORDS)) {
            if (plotLower.includes(keyword)) themes.add(theme);
        }
    }
    return Array.from(themes).slice(0, 6);
}

// --- LLM-powered enrichment generation ---

/**
 * Call Qwen 3.5 LLM to generate Italian why/how for a single work.
 * The prompt is strictly grounded on the actual plot text.
 */
async function callLLM(prompt) {
    // Nuclear timeout: if fetch hangs for >90s, kill the entire process.
    // The .bat loop will restart us with --resume, losing only this one work.
    // This is necessary because Node's AbortSignal.timeout and AbortController
    // CANNOT kill a TCP connection that's hung at the OS level (Ollama freeze).
    const HARD_TIMEOUT_MS = 90000;
    const killTimer = setTimeout(() => {
        log(`  [FATAL] Ollama hung for ${HARD_TIMEOUT_MS/1000}s — forcing process exit for restart`);
        process.exit(1);  // .bat loop will restart with --resume
    }, HARD_TIMEOUT_MS);
    killTimer.unref(); // Don't prevent Node from exiting normally

    try {
        const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: LLM_MODEL,
                messages: [
                    { role: 'user', content: prompt }
                ],
                stream: false,
                think: false,
                options: {
                    temperature: 0.3,
                    num_predict: 500,
                    top_p: 0.9
                }
            }),
            signal: AbortSignal.timeout(60000)
        });

        if (!res.ok) throw new Error(`Ollama status ${res.status}`);
        const data = await res.json();
        return data.message?.content || '';
    } finally {
        clearTimeout(killTimer);
    }
}

/**
 * Build a grounded prompt for one work. The LLM can ONLY use
 * the information we provide — title, creator, year, plot.
 */
function buildPrompt(work, plotText, themes) {
    const title = work.title_it || work.title_en || 'Sconosciuto';
    const creator = work.creator || 'autore sconosciuto';
    const year = work.year || '';
    const typeStr = work.type === 'book' ? 'libro' : 'film';
    const themeStr = themes.join(', ') || 'temi universali';

    // Truncate plot to 600 chars to keep prompt focused
    const plotSnippet = plotText.substring(0, 600);

    return `/no_think
Sei un amico colto e appassionato che consiglia ${typeStr === 'libro' ? 'libri' : 'film'} alle persone. Parli con calore, entusiasmo e empatia.

OPERA: "${title}" di ${creator}${year ? ` (${year})` : ''}
TIPO: ${typeStr}
TEMI: ${themeStr}
TRAMA: ${plotSnippet}

Scrivi un oggetto JSON con due campi:
- "why": 2-3 frasi che spiegano PERCHÉ quest'opera può ISPIRARE chi la guarda/legge. NON riassumere la trama. Invece, racconta quale EMOZIONE regala, quale VERITÀ sulla vita rivela, cosa ti fa SENTIRE. Parla direttamente al lettore con "ti", "scoprirai", "sentirai". Sii specifico su QUESTA opera, non generico.
- "how": 1-2 frasi che suggeriscono IN QUALE MOMENTO DELLA VITA quest'opera può aiutarti di più. Collegala a esperienze reali: "Quando ti senti...", "Se stai attraversando...", "Perfetto se hai bisogno di...". Sii concreto e empatico.

ESEMPI DI TONO GIUSTO:
why: "Ti porta dentro il cuore di un padre che farebbe qualsiasi cosa per ritrovare suo figlio. Sentirai la forza dell'amore incondizionato e scoprirai che il coraggio nasce proprio dalla paura."
how: "Guardalo quando senti che la vita ti chiede più coraggio di quello che credi di avere. Ti ricorderà che la vulnerabilità è una forma di forza."

ESEMPI DI TONO SBAGLIATO (NON fare così):
why: "Film del 2003 diretto da Andrew Stanton. Questo film esplora temi di famiglia e avventura."
how: "Un film da vedere con attenzione, lasciandosi ispirare dalle emozioni che trasmette."

REGOLE:
- Scrivi SOLO in italiano
- USA i fatti dalla trama ma TRASFORMALI in motivazione emotiva
- MAI iniziare con il titolo o "questo film/libro è..."
- MAI usare frasi generiche che andrebbero bene per qualsiasi opera
- Rispondi con SOLO il JSON, nient'altro

{"why":"...","how":"..."}`;
}

/**
 * Parse LLM response, extracting JSON even from messy output.
 */
function parseLLMJson(text) {
    // Remove think tags if present
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    cleaned = cleaned.replace(/<think>[\s\S]*/gi, '').trim();

    // Try direct parse
    try {
        const obj = JSON.parse(cleaned);
        if (obj.why && obj.how) return obj;
    } catch {}

    // Try to find JSON object in text
    const match = cleaned.match(/\{[\s\S]*?"why"[\s\S]*?"how"[\s\S]*?\}/);
    if (match) {
        try {
            const obj = JSON.parse(match[0]);
            if (obj.why && obj.how) return obj;
        } catch {}
    }

    return null;
}

/**
 * Validate enrichment quality:
 * - why must be in Italian (heuristic: common Italian words)
 * - why must be at least 30 chars
 * - how must be at least 15 chars
 */
function validateEnrichment(result) {
    if (!result || !result.why || !result.how) return false;
    if (result.why.length < 30 || result.how.length < 15) return false;

    // Basic Italian detection: check for common Italian words
    const italianMarkers = /\b(di|del|della|che|una|uno|nella|nel|con|per|tra|fra|questa|questo|sono|essere|dove|come|quando|storia|racconta|protagonista)\b/i;
    if (!italianMarkers.test(result.why)) return false;

    return true;
}

// --- Template fallback (same as original project) ---

function templateWhy(work, plotTextIt, plotTextEn, themes) {
    const title = work.title_it || work.title_en || "Quest'opera";
    const isBook = work.type === 'book';
    const typeStr = isBook ? 'libro' : 'film';
    const creator = work.creator || null;
    const year = work.year || null;
    const themeStr = themes.length > 0 ? themes.slice(0, 3).join(', ') : 'temi universali';

    if (plotTextIt) {
        const sentences = plotTextIt.match(/[^.!?]+[.!?]+/g) || [plotTextIt];
        let plotSummary = sentences.slice(0, 2).join(' ').trim();
        if (plotSummary.length > 300) plotSummary = plotSummary.substring(0, 297) + '...';
        return `${plotSummary} Questo ${typeStr} esplora temi di ${themeStr}.`;
    }

    const header = creator && year ? `${title} di ${creator} (${year})`
        : creator ? `${title} di ${creator}`
        : year ? `${title} (${year})`
        : title;

    return `${header}: affronta temi di ${themeStr}. Un ${typeStr} che esplora temi di ${themeStr}.`;
}

function templateHow(work, themes) {
    const isBook = work.type === 'book';
    if (isBook) {
        if (themes.includes('famiglia') || themes.includes('crescita')) return 'Perfetto per una lettura condivisa in famiglia, che apre spunti di riflessione.';
        if (themes.includes('avventura') || themes.includes('magia')) return "Ideale per lasciarsi trasportare dalla fantasia e vivere un'avventura appassionante.";
        if (themes.includes('amore')) return 'Una lettura che scalda il cuore e invita a riflettere sui sentimenti.';
        return 'Un libro da scoprire con calma, lasciandosi ispirare dalla storia.';
    } else {
        if (themes.includes('famiglia') || themes.includes('crescita')) return 'Perfetto per una serata in famiglia, stimola il dialogo su temi importanti.';
        if (themes.includes('avventura') || themes.includes('magia')) return 'Ideale per una serata di pura evasione e meraviglia.';
        if (themes.includes('amore')) return 'Un film da gustare con qualcuno di speciale.';
        return 'Un film da vedere con attenzione, lasciandosi ispirare dalle emozioni che trasmette.';
    }
}

// --- Main ---

async function generateAll() {
    // Clear log file
    fs.writeFileSync(LOG_FILE, '');
    log('='.repeat(55));
    log(' Inspire v2-Qwen — Generate Enrichments (LLM Pipeline)');
    log(`  LLM Model: ${LLM_MODEL}`);
    log(`  Resume: ${RESUME}`);
    log('='.repeat(55));

    // Verify LLM is available
    try {
        const tagRes = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(5000) });
        const tags = await tagRes.json();
        const available = (tags.models || []).some(m =>
            (m.name || m.model || '').includes(LLM_MODEL.split(':')[0])
        );
        if (!available) {
            console.error(`Model ${LLM_MODEL} not found. Run: ollama pull ${LLM_MODEL}`);
            process.exit(1);
        }
        log(`LLM ${LLM_MODEL} available`);
    } catch (err) {
        console.error(`Cannot connect to Ollama: ${err.message}`);
        process.exit(1);
    }

    const d = db.getDb();

    // Get all works with plots
    const works = d.prepare(`
        SELECT w.*, p.plot_text, p.language as plot_lang
        FROM works w
        INNER JOIN plots p ON w.id = p.work_id
        ORDER BY w.sitelinks DESC, w.id
    `).all();

    // Group by work_id
    const workPlots = new Map();
    for (const row of works) {
        if (!workPlots.has(row.id)) {
            workPlots.set(row.id, { work: row, plots: {} });
        }
        workPlots.get(row.id).plots[row.plot_lang] = row.plot_text;
    }

    log(`Works with plots: ${workPlots.size}`);

    // If resume, filter out works that already have enrichments
    let workList = Array.from(workPlots.entries());
    if (RESUME) {
        const existing = d.prepare(`SELECT work_id FROM enrichments WHERE language = 'it'`).all();
        const existingSet = new Set(existing.map(r => r.work_id));
        workList = workList.filter(([id]) => !existingSet.has(id));
        log(`Skipping ${existingSet.size} existing, processing ${workList.length}`);
    }

    // Hybrid strategy: LLM for top N by popularity, template for the rest
    const LLM_TOP_N = parseInt(process.env.LLM_TOP_N || '1000');
    log(`Strategy: LLM for top ${LLM_TOP_N} by popularity, template for rest`);

    let llmSuccess = 0;
    let llmFailed = 0;
    let templateCount = 0;
    const startTime = Date.now();

    for (let i = 0; i < workList.length; i++) {
        const [workId, data] = workList[i];
        const { work, plots } = data;
        const plotText = plots.en || plots.it || '';
        const genres = safeJsonParse(work.genres, []);
        const themes = extractThemes(plotText, genres);

        let whyText, howText;
        const useLLM = i < LLM_TOP_N; // workList is sorted by sitelinks DESC

        if (useLLM) {
            // LLM generation for top works
            try {
                if (i < 5) log(`  [DEBUG] LLM call #${i} for work ${workId} "${work.title_it || work.title_en}"...`);
                const prompt = buildPrompt(work, plotText, themes);
                const rawResponse = await callLLM(prompt);
                if (i < 5) log(`  [DEBUG] LLM response length: ${rawResponse.length}`);
                const parsed = parseLLMJson(rawResponse);

                if (parsed && validateEnrichment(parsed)) {
                    whyText = parsed.why.trim();
                    howText = parsed.how.trim();
                    llmSuccess++;
                    if (i < 3) log(`  [DEBUG] LLM OK: ${whyText.substring(0, 80)}...`);
                } else {
                    throw new Error(`Invalid LLM output: ${(rawResponse || '').substring(0, 100)}`);
                }
            } catch (err) {
                // Fallback to template on LLM failure
                llmFailed++;
                if (i < 10) log(`  [WARN] LLM fail #${i}: ${err.message}`);
                whyText = templateWhy(work, plots.it || '', plots.en || '', themes);
                howText = templateHow(work, themes);
            }
        } else {
            // Template for the rest (fast, no LLM)
            templateCount++;
            whyText = templateWhy(work, plots.it || '', plots.en || '', themes);
            howText = templateHow(work, themes);
        }

        // Save to DB
        try {
            db.upsertEnrichment({
                work_id: workId,
                language: 'it',
                themes,
                why_text: whyText,
                how_text: howText
            });
        } catch (e) {
            if (i < 5) console.error(`  DB error for ${workId}: ${e.message}`);
        }

        // Progress every 50 works (use console.log for file redirect compatibility)
        if ((i + 1) % 50 === 0 || i === workList.length - 1) {
            const pct = Math.round(((i + 1) / workList.length) * 100);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            const rate = ((i + 1) / ((Date.now() - startTime) / 1000)).toFixed(1);
            const eta = ((workList.length - i - 1) / (rate || 1) / 60).toFixed(1);
            const phase = i < LLM_TOP_N ? 'LLM' : 'TEMPLATE';
            log(`  [${pct}%] ${i + 1}/${workList.length} | ${phase} | LLM:${llmSuccess} fail:${llmFailed} tmpl:${templateCount} | ${rate}/s | ETA ${eta}min`);
        }

        // Small delay only during LLM phase
        if (useLLM && i < workList.length - 1) await sleep(50);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`Done! LLM success: ${llmSuccess}, LLM failed: ${llmFailed}, Template: ${templateCount}, Time: ${elapsed}s`);
    log(`LLM success rate: ${(llmSuccess / Math.max(llmSuccess + llmFailed, 1) * 100).toFixed(1)}%`);

    // Rebuild FTS5 index
    log('Rebuilding FTS5 index...');
    db.rebuildFtsIndex();

    db.close();
    return { llmSuccess, llmFailed, templateCount, total: workList.length };
}

function safeJsonParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Run if called directly
if (require.main === module) {
    generateAll().then(r => {
        console.log('Result:', JSON.stringify(r));
        process.exit(0);
    }).catch(e => {
        console.error('Fatal:', e);
        process.exit(1);
    });
}

module.exports = { generateAll, extractThemes };
