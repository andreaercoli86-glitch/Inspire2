'use strict';

const OLLAMA_BASE = 'http://localhost:11434';
const LLM_MODEL = 'qwen3.5:4b';

async function testQuality() {
    // Real enrichment prompt similar to what generate-enrichments.js would send
    const prompt = `Sei un esperto di cinema.
Ti viene fornita la TRAMA REALE di un'opera. Devi scrivere in ITALIANO:

OPERA: "Il Signore degli Anelli: La Compagnia dell'Anello" di Peter Jackson (2001)
TIPO: film
TEMI: avventura, amicizia, coraggio, magia
TRAMA: A meek Hobbit from the Shire and eight companions set out on a journey to destroy the powerful One Ring and save Middle-earth from the Dark Lord Sauron. The young hobbit Frodo Baggins inherits a mysterious ring from his uncle Bilbo. When the wizard Gandalf reveals that it is the One Ring, forged by the Dark Lord Sauron to control all other rings of power, Frodo must embark on a perilous quest to Mount Doom to destroy it.

Scrivi un oggetto JSON con due campi:
- "why": 2-3 frasi in italiano che descrivono DI COSA PARLA quest'opera, basandoti ESCLUSIVAMENTE sulla trama fornita sopra. Non inventare dettagli. Sii coinvolgente ma preciso.
- "how": 1 frase pratica su come/quando gustare quest'opera (es. "Perfetto per una serata in famiglia").

REGOLE TASSATIVE:
- Scrivi SOLO in italiano
- USA SOLO fatti dalla trama sopra, MAI inventare
- Il campo "why" deve iniziare descrivendo la storia, non il titolo
- Rispondi con SOLO il JSON, nient'altro

{"why":"...","how":"..."}`;

    // Test WITH think:false (chat API)
    console.log('=== Chat API + think:false (our approach) ===');
    const t1 = Date.now();
    const res1 = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: LLM_MODEL,
            messages: [{ role: 'user', content: prompt }],
            stream: false,
            think: false,
            options: { temperature: 0.3, num_predict: 500, top_p: 0.9 }
        })
    });
    const d1 = await res1.json();
    console.log('Time:', ((Date.now() - t1) / 1000).toFixed(1) + 's');
    console.log('Tokens used:', d1.eval_count);
    console.log('Done reason:', d1.done_reason);
    console.log('Response:');
    console.log(d1.message?.content);

    // Test WITH thinking enabled (for comparison)
    console.log('\n=== Chat API + think:true (with reasoning) ===');
    const t2 = Date.now();
    const res2 = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: LLM_MODEL,
            messages: [{ role: 'user', content: prompt }],
            stream: false,
            think: true,
            options: { temperature: 0.3, num_predict: 2000, top_p: 0.9 }
        })
    });
    const d2 = await res2.json();
    console.log('Time:', ((Date.now() - t2) / 1000).toFixed(1) + 's');
    console.log('Tokens used:', d2.eval_count);
    console.log('Done reason:', d2.done_reason);
    console.log('Response:');
    console.log(d2.message?.content);
}

testQuality().catch(e => console.error('Fatal:', e.message));
