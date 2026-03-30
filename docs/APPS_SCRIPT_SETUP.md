# Google Apps Script Setup Guide

## Step 1: Open Google Apps Script

1. Go to https://script.google.com
2. Click **"New Project"**
3. Name it: `Presales Tracker API`

## Step 2: Paste this Script

Delete everything in the editor and paste the following:

```javascript
const SHEET_ID = "1U-kaTF-TEAd835RQVnZd4aCH5c9Wx9PVrzsENaJRtog";
const TRACKING_TAB = "tracking";
const CLIENTS_TAB = "Sheet1"; // or whatever your client sheet tab is named

function doGet(e) {
  const action = e.parameter.action;
  const clientId = e.parameter.client_id;

  if (action === "get_tracking" && clientId) {
    return getTracking(clientId);
  }

  if (action === "get_clients") {
    return getClients();
  }

  return ContentService.createTextOutput(JSON.stringify({ error: "Unknown action" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const { client_id, event, timestamp } = data;

    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(TRACKING_TAB);

    // Create tracking sheet if it doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet(TRACKING_TAB);
      sheet.appendRow(["client_id", "event", "timestamp"]);
    }

    sheet.appendRow([client_id, event, timestamp || new Date().toISOString()]);

    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getTracking(clientId) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(TRACKING_TAB);

  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const events = rows.slice(1)
    .filter(row => row[0] == clientId)
    .map(row => ({
      client_id: row[0],
      event: row[1],
      timestamp: row[2]
    }));

  return ContentService.createTextOutput(JSON.stringify(events))
    .setMimeType(ContentService.MimeType.JSON);
}

function getClients() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(CLIENTS_TAB) || ss.getSheets()[0];
  const rows = sheet.getDataRange().getValues();

  if (rows.length < 2) {
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const headers = rows[0].map(h => h.toString().toLowerCase().trim());
  const clients = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  }).filter(c => c['client id'] || c['client_id']);

  return ContentService.createTextOutput(JSON.stringify(clients))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## Step 3: Deploy as Web App

1. Click **"Deploy"** → **"New Deployment"**
2. Click the gear icon ⚙️ next to "Type" → Select **"Web app"**
3. Set:
   - **Description**: Presales Tracker v1
   - **Execute as**: Me
   - **Who has access**: **Anyone** ← IMPORTANT
4. Click **"Deploy"**
5. Copy the **Web App URL** — it looks like:
   `https://script.google.com/macros/s/XXXXXXXXXXXXXXX/exec`

## Step 4: Add Web App URL to the App

Open `main.js` and replace this line at the top:

```javascript
const APPS_SCRIPT_URL = "YOUR_APPS_SCRIPT_URL_HERE";
```

Paste your Web App URL between the quotes.

## Step 5: Set up the Client Google Sheet

Make sure your sheet at:
`https://docs.google.com/spreadsheets/d/1U-kaTF-TEAd835RQVnZd4aCH5c9Wx9PVrzsENaJRtog`

Has these columns in **Sheet1** (Row 1 = headers):

| client id | company name | email | industry | size | notes |
|-----------|--------------|-------|----------|------|-------|
| FRIST001  | Acme Corp    | contact@acme.com | Manufacturing | 200 | |

The `client id` column is used to generate unique bot links.

## Step 6: Re-deploy Netlify

After updating `main.js` with your Apps Script URL, run:
```bash
npm run build
```
Then deploy the `dist/` folder to Netlify.
