const DRIVE_FOLDER = "1LnN6Pas8UtmyzJ8VgGtuDF9HFHxHcuw-";

export async function uploadFileToDrive(token, name, blob) {
    const metadata = { name, parents: [DRIVE_FOLDER], mimeType: 'text/html' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: form
    });

    if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error?.message || 'Upload failed ' + r.status);
    }
    return await r.json();
}
