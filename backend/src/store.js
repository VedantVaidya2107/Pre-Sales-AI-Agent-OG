const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/**
 * Read a JSON data file. Returns defaultValue if missing or corrupt.
 */
function read(filename, defaultValue = []) {
  const fp = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(fp)) return defaultValue;
    const raw = fs.readFileSync(fp, 'utf8');
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

/**
 * Write data to a JSON file.
 */
function write(filename, data) {
  const fp = path.join(DATA_DIR, filename);
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { read, write };
