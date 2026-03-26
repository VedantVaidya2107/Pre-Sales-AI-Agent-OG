
const https = require('https');
const fs = require('fs');
const GKEY = "YOUR_API_KEY_HERE";

function getModels(version) {
    return new Promise((resolve) => {
        https.get(`https://generativelanguage.googleapis.com/${version}/models?key=${GKEY}`, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ version, data: json });
                } catch (e) {
                    resolve({ version, error: data });
                }
            });
        }).on('error', (err) => {
            resolve({ version, error: err.message });
        });
    });
}

async function run() {
    const v1 = await getModels('v1');
    const v1beta = await getModels('v1beta');
    fs.writeFileSync('models_diag.json', JSON.stringify({ v1, v1beta }, null, 2));
    console.log("Diagnostic complete. File saved to models_diag.json");
}

run();
