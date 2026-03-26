
const https = require('https');
const GKEY = "REPLACE_WITH_YOUR_KEY";

function getModels(version) {
    return new Promise((resolve) => {
        https.get(`https://generativelanguage.googleapis.com/${version}/models?key=${GKEY}`, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log(`--- ${version} ---`);
                    if (json.models) {
                        json.models.forEach(m => console.log(m.name));
                    } else {
                        console.log(JSON.stringify(json));
                    }
                } catch (e) {
                    console.log(`${version} parsing failed: ${data}`);
                }
                resolve();
            });
        }).on('error', (err) => {
            console.log(`${version} request failed: ${err.message}`);
            resolve();
        });
    });
}

async function run() {
    await getModels('v1');
    await getModels('v1beta');
}

run();
