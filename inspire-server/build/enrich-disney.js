'use strict';
const fs = require('fs');
const path = require('path');
const db = require('../db');

const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://localhost:11434';
const LLM_MODEL = 'qwen3.5:4b';
const LOG_FILE = path.join(__dirname, '..', '..', 'enrich_disney_log.txt');

function log(msg) {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    fs.appendFileSync(LOG_FILE, line + '\n');
}

async function callLLM(prompt) {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: LLM_MODEL,
            messages: [{ role: 'user', content: prompt }],
            stream: false,
            think: false,
            options: { temperature: 0.3, num_predict: 500, top_p: 0.9 }
        }),
        signal: AbortSignal.timeout(90000)
    });
    if (!res.ok) throw new Error(`Ollama status ${res.status}`);
    const data = await res.json();
    return data.message?.content || '';
}

function buildPrompt(work, plotText) {
    const title = work.title_it || work.title_en;
    const type = work.type === 'book' ? 'libro' : 'film';
    const creator = work.creator || 'autore sconosciuto';
    return `Sei un amico colto e appassionato che consiglia ${type === 'libro' ? 'libri' : 'film'}. Parli con calore, entusiasmo e empatia.

OPERA: "${title}" di ${creator} (${work.year || 'anno sconosciuto'})
TIPO: ${type}
TRAMA: ${plotText.substring(0, 800)}

Rispondi in italiano con ESATTAMENTE questo formato JSON:
{
  "why": "2-3 frasi che spiegano PERCHÉ quest'opera può ISPIRARE. NON riassumere la trama. Racconta quale EMOZIONE regala, quale VERITÀ sulla vita rivela. Parla al lettore con tu/ti/scoprirai/sentirai.",
  "how": "1-2 frasi su IN QUALE MOMENTO DELLA VITA quest'opera aiuta di più. Collegala a esperienze reali: Quando ti senti..., Se stai attraversando..., Perfetto se...",
  "themes": ["tema1", "tema2", "tema3", "tema4", "tema5"]
}

ESEMPI DI TONO GIUSTO:
why: "Ti porta dentro il cuore di un padre che farebbe qualsiasi cosa per ritrovare suo figlio. Sentirai la forza dell'amore incondizionato e scoprirai che il coraggio nasce proprio dalla paura."
how: "Guardalo quando senti che la vita ti chiede più coraggio di quello che credi di avere. Ti ricorderà che la vulnerabilità è una forma di forza."

REGOLE:
- Scrivi SOLO il JSON, nient'altro
- I temi devono essere in italiano, 1-3 parole ciascuno
- Massimo 5 temi
- MAI iniziare why con il titolo o "questo film è..."
- MAI frasi generiche che andrebbero bene per qualsiasi opera`;
}

async function main() {
    fs.writeFileSync(LOG_FILE, '');
    log('=== Generate Enrichments for Disney/Pixar ===\n');

    const d = db.getDb();

    // Get Disney/Pixar works with plots
    const works = d.prepare(`
        SELECT w.* FROM works w
        INNER JOIN plots p ON w.id = p.work_id
        WHERE w.id >= 24422 AND w.id <= 24469
        GROUP BY w.id
        ORDER BY w.id
    `).all();
    log(`Found ${works.length} Disney/Pixar works`);

    // Check which already have enrichments
    const existingEnrich = new Set(
        d.prepare("SELECT work_id FROM enrichments WHERE work_id >= 24422 AND work_id <= 24469").all()
            .map(r => r.work_id)
    );
    log(`Already enriched: ${existingEnrich.size}`);

    const insertEnrich = d.prepare(`
        INSERT OR REPLACE INTO enrichments (work_id, language, why_text, how_text, themes, created_at)
        VALUES (?, 'it', ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    let success = 0, failed = 0, skipped = 0;

    for (let i = 0; i < works.length; i++) {
        const w = works[i];
        // Always regenerate with new empathetic prompt
        // if (existingEnrich.has(w.id)) {
        //     log(`[${i+1}/${works.length}] ${w.title_en} — SKIP (already enriched)`);
        //     skipped++;
        //     continue;
        // }

        // Get best plot
        const plots = d.prepare('SELECT language, plot_text FROM plots WHERE work_id = ?').all(w.id);
        const bestPlot = (plots.find(p => p.language === 'it') || plots.find(p => p.language === 'en'))?.plot_text;
        if (!bestPlot) {
            log(`[${i+1}/${works.length}] ${w.title_en} — SKIP (no plot)`);
            skipped++;
            continue;
        }

        log(`[${i+1}/${works.length}] ${w.title_en || w.title_it}...`);

        try {
            const prompt = buildPrompt(w, bestPlot);
            const response = await callLLM(prompt);

            // Parse JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('No JSON in response');

            const parsed = JSON.parse(jsonMatch[0]);
            const why = parsed.why || '';
            const how = parsed.how || '';
            const themes = JSON.stringify(parsed.themes || []);

            if (why.length < 5) throw new Error('why too short');

            insertEnrich.run(w.id, why, how, themes);
            log(`  OK: why=${why.substring(0, 60)}... themes=${themes}`);
            success++;
        } catch(e) {
            log(`  ERROR: ${e.message}`);
            failed++;
        }
    }

    log(`\n=== DONE === Success: ${success}, Failed: ${failed}, Skipped: ${skipped}`);
    db.close();
}

main().catch(e => { log('FATAL: ' + e.message); process.exit(1); });
