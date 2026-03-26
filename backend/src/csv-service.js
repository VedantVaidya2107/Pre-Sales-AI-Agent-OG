// Parses the new client sheet (Sheet 2) with columns:
// client id | company name | email | industry | size | notes
export function parseClientCSV(csv) {
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return [];

    const parseLine = line => {
        const out = [];
        let cur = '', inq = false;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') { inq = !inq; continue; }
            if (line[i] === ',' && !inq) { out.push(cur.trim()); cur = ''; continue; }
            cur += line[i];
        }
        out.push(cur.trim());
        return out;
    };

    const hdr = parseLine(lines[0]).map(h => h.replace(/"/g, '').trim().toLowerCase());
    return lines.slice(1).map(line => {
        const v = parseLine(line);
        const o = {};
        hdr.forEach((h, i) => o[h] = (v[i] || '').replace(/^"|"$/g, '').trim());
        return {
            client_id: o['client id'] || o['client_id'] || o['id'] || '',
            company: o['company name'] || o['company'] || '',
            email: o['email'] || '',
            industry: o['industry'] || '',
            size: o['company size'] || o['size'] || '',
            notes: o['notes'] || ''
        };
    }).filter(c => c.client_id && c.email);
}

export function parseCSV(csv) {
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return [];

    const parseLine = line => {
        const out = [];
        let cur = '', inq = false;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') { inq = !inq; continue; }
            if (line[i] === ',' && !inq) { out.push(cur.trim()); cur = ''; continue; }
            cur += line[i];
        }
        out.push(cur.trim());
        return out;
    };

    const hdr = parseLine(lines[0]).map(h => h.replace(/"/g, '').trim().toLowerCase());
    return lines.slice(1).map(line => {
        const v = parseLine(line);
        const o = {};
        hdr.forEach((h, i) => o[h] = (v[i] || '').replace(/^"|"$/g, '').trim());
        return {
            company: o['company name'] || o['company'] || '',
            email: o['email'] || '',
            password: o['password'] || '',
            industry: o['industry'] || '',
            size: o['company size'] || o['size'] || '',
            notes: o['notes'] || '',
            active: (o['active'] || 'yes').toLowerCase() !== 'no'
        };
    }).filter(c => c.email && c.password && c.active);
}
