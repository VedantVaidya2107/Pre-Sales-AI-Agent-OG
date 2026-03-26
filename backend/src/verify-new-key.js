// Using native fetch available in Node.js 18+

const GKEY = "REPLACE_WITH_YOUR_KEY";

async function verify() {
    const models = ["gemini-2.5-flash", "gemini-2.5-pro"];
    for (const model of models) {
        console.log(`Testing ${model}...`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GKEY}`;
        try {
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: "Hello, confirm you are working." }] }]
                })
            });
            const d = await r.json();
            if (r.ok) {
                console.log(`[OK] ${model} responded: ${d.candidates[0].content.parts[0].text.substring(0, 50)}...`);
            } else {
                console.error(`[FAIL] ${model}: ${d.error?.message || JSON.stringify(d)}`);
            }
        } catch (e) {
            console.error(`[ERROR] ${model}: ${e.message}`);
        }
    }
}

verify();
