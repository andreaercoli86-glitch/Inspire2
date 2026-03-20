'use strict';

const OLLAMA_BASE = 'http://localhost:11434';
const LLM_MODEL = 'qwen3.5:4b';

async function test() {
    // Test 1: Simple prompt without /no_think
    console.log('=== TEST 1: Simple prompt ===');
    const res1 = await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: LLM_MODEL,
            prompt: 'Rispondi in italiano con SOLO un JSON: {"why":"motivo","how":"consiglio"}',
            stream: false,
            options: { temperature: 0.3, num_predict: 200 }
        })
    });
    const d1 = await res1.json();
    console.log('Response:', JSON.stringify(d1.response).substring(0, 500));
    console.log('Done reason:', d1.done_reason);
    console.log('Eval count:', d1.eval_count);

    // Test 2: Same prompt with /no_think
    console.log('\n=== TEST 2: With /no_think ===');
    const res2 = await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: LLM_MODEL,
            prompt: '/no_think\nRispondi in italiano con SOLO un JSON: {"why":"motivo","how":"consiglio"}',
            stream: false,
            options: { temperature: 0.3, num_predict: 200 }
        })
    });
    const d2 = await res2.json();
    console.log('Response:', JSON.stringify(d2.response).substring(0, 500));
    console.log('Done reason:', d2.done_reason);
    console.log('Eval count:', d2.eval_count);
}

test().catch(e => console.error('Error:', e.message));
