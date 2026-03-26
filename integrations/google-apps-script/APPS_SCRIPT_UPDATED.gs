// ═══════════════════════════════════════════════════════════
//  Fristine Presales — Google Apps Script (REPLACE ALL)
//  Handles: Email sending, Event tracking, Proposal storage
// ═══════════════════════════════════════════════════════════

const SHEET_ID = "1U-kaTF-TEAd835RQVnZd4aCH5c9Wx9PVrzsENaJRtog";
const TRACKING_TAB = "tracking";
const PROPOSALS_TAB = "proposals";

// ── GET requests (read data) ──────────────────────────────
function doGet(e) {
  const action = e.parameter.action;
  const clientId = e.parameter.client_id;

  try {
    if (action === "get_tracking" && clientId) {
      return getTracking(clientId);
    }
    if (action === "get_proposal" && clientId) {
      return getProposal(clientId);
    }
    return jsonResponse({ error: "Unknown action" });
  } catch(err) {
    return jsonResponse({ error: err.toString() });
  }
}

// ── POST requests (write data) ───────────────────────────
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    if (action === "log_event") {
      return logEvent(body.client_id, body.event, body.timestamp);
    }
    if (action === "send_email") {
      return sendBotEmail(body.to, body.company, body.client_id, body.bot_url);
    }
    if (action === "save_proposal") {
      return saveProposal(body.client_id, body.proposal_html, body.timestamp);
    }

    return jsonResponse({ error: "Unknown action: " + action });
  } catch(err) {
    return jsonResponse({ error: err.toString() });
  }
}

// ── Log a tracking event ─────────────────────────────────
function logEvent(clientId, event, timestamp) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(TRACKING_TAB);

  if (!sheet) {
    sheet = ss.insertSheet(TRACKING_TAB);
    sheet.appendRow(["client_id", "event", "timestamp"]);
    sheet.getRange(1, 1, 1, 3).setFontWeight("bold");
  }

  const ts = timestamp || new Date().toISOString();
  sheet.appendRow([clientId, event, ts]);
  return jsonResponse({ success: true, client_id: clientId, event: event });
}

// ── Get all tracking events for a client ─────────────────
function getTracking(clientId) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(TRACKING_TAB);

  if (!sheet) return jsonResponse([]);

  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return jsonResponse([]);

  const events = rows.slice(1)
    .filter(row => String(row[0]).trim() === String(clientId).trim())
    .map(row => ({
      client_id: row[0],
      event: row[1],
      timestamp: row[2]
    }));

  return jsonResponse(events);
}

// ── Save proposal HTML ────────────────────────────────────
function saveProposal(clientId, proposalHtml, timestamp) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(PROPOSALS_TAB);

  if (!sheet) {
    sheet = ss.insertSheet(PROPOSALS_TAB);
    sheet.appendRow(["client_id", "timestamp", "proposal_html"]);
    sheet.getRange(1, 1, 1, 3).setFontWeight("bold");
  }

  // Check if proposal already exists for this client — update it
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(clientId).trim()) {
      sheet.getRange(i + 1, 2).setValue(timestamp || new Date().toISOString());
      sheet.getRange(i + 1, 3).setValue(proposalHtml);
      return jsonResponse({ success: true, updated: true });
    }
  }

  // New entry
  sheet.appendRow([clientId, timestamp || new Date().toISOString(), proposalHtml]);
  return jsonResponse({ success: true, updated: false });
}

// ── Get proposal HTML for a client ───────────────────────
function getProposal(clientId) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(PROPOSALS_TAB);

  if (!sheet) return jsonResponse({ proposal_html: null });

  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(clientId).trim()) {
      return jsonResponse({ proposal_html: rows[i][2], timestamp: rows[i][1] });
    }
  }

  return jsonResponse({ proposal_html: null });
}

// ── Send email via Gmail ──────────────────────────────────
function sendBotEmail(to, company, clientId, botUrl) {
  if (!to || !botUrl) {
    return jsonResponse({ success: false, error: "Missing to or botUrl" });
  }

  const subject = `Your Zoho Discovery Agent is Ready — ${company}`;
  const htmlBody = `
    <div style="font-family: 'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #F8FAFF; color: #0A1F44; padding: 40px 20px;">
      <!-- Header -->
      <div style="background-color: #0A1F44; border-radius: 20px 20px 0 0; padding: 44px 40px; text-align: center; border-bottom: 4px solid #E05A2B;">
        <div style="width: 52px; height: 52px; background-color: #E05A2B; border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 800; color: #ffffff; margin-bottom: 20px;">F</div>
        <h1 style="color: #ffffff; font-size: 26px; margin: 0; font-weight: 800; letter-spacing: -1px; line-height: 1.2;">Your Strategy Discovery<br/>Session is Ready</h1>
      </div>

      <!-- Content -->
      <div style="background-color: #ffffff; border-radius: 0 0 20px 20px; padding: 40px; box-shadow: 0 15px 35px rgba(10,31,68,0.08); border: 1px solid #E2E8F4; border-top: none;">
        <p style="font-size: 16px; font-weight: 700; color: #0A1F44; margin: 0 0 16px;">Hello ${company} Team,</p>
        <p style="font-size: 15px; color: #5A6A85; line-height: 1.7; margin: 0 0 32px;">
          We are pleased to invite you to your personalized **Zoho Discovery Session**. This AI-powered consultation will analyze your business requirements and architect a high-fidelity Zoho implementation roadmap tailored for <strong>${company}</strong>.
        </p>

        <!-- CTA Box -->
        <div style="background-color: #F4F6FB; border-radius: 16px; padding: 32px; text-align: center; border: 1px dashed #CBD5E8;">
          <a href="${botUrl}" style="display: inline-block; background-color: #0A1F44; color: #ffffff; text-decoration: none; padding: 16px 44px; border-radius: 12px; font-size: 16px; font-weight: 700; transition: all 0.3s ease; box-shadow: 0 8px 20px rgba(10,31,68,0.2);">
            🚀 Launch Discovery Agent →
          </a>
          <p style="margin: 20px 0 0; font-size: 12px; color: #95A3BC;">
            Secure Access Token: <code style="color: #E05A2B; font-weight: 700;">${clientId}</code>
          </p>
        </div>

        <div style="margin-top: 40px; padding-top: 32px; border-top: 1px solid #E2E8F4; text-align: center;">
          <p style="font-size: 14px; font-weight: 700; color: #0A1F44; margin: 0 0 4px;">Fristine Infotech Pre-Sales</p>
          <p style="font-size: 12px; color: #95A3BC; margin: 0;">India's Leading Premium Zoho Partner</p>
        </div>
      </div>

      <p style="color: #95A3BC; font-size: 11px; text-align: center; margin-top: 24px;">
        CONFIDENTIAL · ${new Date().getFullYear()} Fristine Infotech Pvt Ltd<br/>
        This invitation is intended for the addressee only.
      </p>
    </div>
  `;

  try {
    GmailApp.sendEmail(to, subject, `Hi ${company} Team,\n\nYour Zoho Discovery Agent is ready.\n\nStart your session here: ${botUrl}\n\nBest regards,\nFristine Infotech Pre-Sales Team`, {
      htmlBody: htmlBody,
      name: "Fristine Infotech Pre-Sales"
    });

    // Also log the bot_sent event automatically
    logEvent(clientId, "bot_sent", new Date().toISOString());

    return jsonResponse({ success: true, sent_to: to });
  } catch(err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// ── Helper: return JSON response ─────────────────────────
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
