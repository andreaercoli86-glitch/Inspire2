'use strict';

const OLLAMA_BASE = 'http://localhost:11434';
const LLM_MODEL = 'qwen3.5:4b';

async function test() {
    const prompt = `/no_think
Sei un esperto di letteratura.
Ti viene fornita la TRAMA REALE di un'opera. Devi scrivere in ITALIANO:

OPERA: "Il gatto col cappello" di Dr. Seuss (1957)
TIPO: libro
TEMI: famiglia, avventura, potere
TRAMA: The story begins as a girl named Sally and her unnamed brother sit alone in their house on a cold, rainy day. Then they hear a loud bump followed by the arrival of the Cat in the Hat, a tall anthropomorphic cat. The Cat proposes to entertain the children with tricks. The game quickly becomes more complicated, as the Cat balances himself on a ball and tries to balance lots of household items.

Scrivi un oggetto JSON con due campi:
- "why": 2-3 frasi in italiano che descrivono DI COSA PARLA quest'opera, basandoti ESCLUSIVAMENTE sulla trama fornita sopra. Non inventare dettagli. Sii coinvolgente ma preciso.
- "how": 1 frase pratica su come/quando gustare quest'opera (es. "Perfetto per una serata in famiglia").

REGOLE TASSATIVE:
- Scrivi SOLO in italiano
- USA SOLO fatti dalla trama sopra, MAI inventare
- Il campo "why" deve iniziare descrivendo la storia, non il titolo
- Rispondi con SOLO il JSON, nient'altro

{"why":"...","how":"..."}`;

    console.log('Calling LLM...');
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: LLM_MODEL,
            prompt: prompt,
            stream: false,
            options: { temperature: 0.3, num_predict: 500, top_p: 0.9 }
        })
    });

    const data = await res.json();
    console.log('\n=== RAW RESPONSE ===');
    console.log(data.response);
    console.log('\n=== PARSE ATTEMPT ===');

    let cleaned = (data.response || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    cleaned = cleaned.replace(/<think>[\s\S]*/gi, '').trim();
    console.log('Cleaned:', cleaned);

    try {
        const obj = JSON.parse(cleaned);
        console.log('\nParsed OK:', obj);
    } catch(e) {
        console.log('\nDirect parse failed:', e.message);
        const match = cleaned.match(/\{[\s\S]*?"why"[\s\S]*?"how"[\s\S]*?\}/);
        if (match) {
            try {
                console.log('Regex match:', match[0]);
                console.log('Parsed:', JSON.parse(match[0]));
            } catch(e2) { console.log('Regex parse failed:', e2.message); }
        } else {
            console.log('No JSON pattern found');
        }
    }
}

test().catch(e => console.error('Error:', e.message));
