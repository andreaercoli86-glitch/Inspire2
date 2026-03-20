'use strict';

const OLLAMA_BASE = 'http://localhost:11434';
const LLM_MODEL = 'qwen3.5:4b';

async function test() {
    // Test with much higher num_predict to let thinking complete
    console.log('=== TEST: num_predict=2000 ===');
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: LLM_MODEL,
            prompt: 'Scrivi in italiano un breve JSON. {"why":"perche leggere Il Gatto col Cappello","how":"consiglio pratico"}. Rispondi SOLO con il JSON.',
            stream: false,
            options: { temperature: 0.3, num_predict: 2000 }
        })
    });
    const d = await res.json();
    console.log('Response length:', (d.response || '').length);
    console.log('Done reason:', d.done_reason);
    console.log('Eval count:', d.eval_count);
    console.log('Full response:');
    console.log(d.response);
}

test().catch(e => console.error('Error:', e.message));
