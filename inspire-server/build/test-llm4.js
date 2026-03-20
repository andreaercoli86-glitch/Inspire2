'use strict';

const OLLAMA_BASE = 'http://localhost:11434';
const LLM_MODEL = 'qwen3.5:4b';

async function test() {
    // Test 1: Chat API with think:false (official Ollama way to disable thinking)
    console.log('=== TEST 1: Chat API + think:false ===');
    try {
        const res1 = await fetch(`${OLLAMA_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: LLM_MODEL,
                messages: [
                    { role: 'user', content: 'Scrivi SOLO questo JSON in italiano: {"why":"un motivo per leggere Il Gatto col Cappello","how":"un consiglio pratico"}' }
                ],
                stream: false,
                think: false,
                options: { temperature: 0.3, num_predict: 500 }
            })
        });
        const d1 = await res1.json();
        console.log('Message content:', d1.message?.content?.substring(0, 500));
        console.log('Done reason:', d1.done_reason);
        console.log('Eval count:', d1.eval_count);
    } catch(e) { console.log('Error:', e.message); }

    // Test 2: Generate API with /no_think in system template
    console.log('\n=== TEST 2: Generate API with system ===');
    try {
        const res2 = await fetch(`${OLLAMA_BASE}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: LLM_MODEL,
                system: 'You are a helpful assistant. Do not use thinking. Reply directly.',
                prompt: 'Scrivi SOLO questo JSON: {"why":"un motivo","how":"un consiglio"}',
                stream: false,
                think: false,
                options: { temperature: 0.3, num_predict: 500 }
            })
        });
        const d2 = await res2.json();
        console.log('Response:', (d2.response || '').substring(0, 500));
        console.log('Done reason:', d2.done_reason);
        console.log('Eval count:', d2.eval_count);
    } catch(e) { console.log('Error:', e.message); }
}

test().catch(e => console.error('Fatal:', e.message));
