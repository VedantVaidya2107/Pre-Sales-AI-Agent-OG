
import fetch from 'node-fetch';

const GKEY = "YOUR_API_KEY_HERE";

async function check() {
    try {
        console.log("Checking v1beta models...");
        const r1 = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GKEY}`);
        const d1 = await r1.json();
        console.log("v1beta Status:", r1.status);
        if (d1.models) {
            console.log("Available models (v1beta):", d1.models.map(m => m.name).join(", "));
        } else {
            console.log("No models returned for v1beta:", JSON.stringify(d1));
        }

        console.log("\nChecking v1 models...");
        const r2 = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${GKEY}`);
        const d2 = await r2.json();
        console.log("v1 Status:", r2.status);
        if (d2.models) {
            console.log("Available models (v1):", d2.models.map(m => m.name).join(", "));
        } else {
            console.log("No models returned for v1:", JSON.stringify(d2));
        }
    } catch (e) {
        console.error("Check failed:", e);
    }
}

check();
