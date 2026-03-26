const router     = require('express').Router();
const nodemailer = require('nodemailer');

function buildTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('[Email] EMAIL_USER / EMAIL_PASS not set — emails will be simulated.');
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

function buildBotEmailHtml({ company, clientId, botUrl }) {
  return `
<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{font-family:'Segoe UI',sans-serif;background:#f4f6fb;margin:0;padding:0}
  .wrap{max-width:540px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .header{background:#0A1F44;padding:32px 40px;text-align:center}
  .logo{display:inline-flex;align-items:center;gap:10px;color:#fff;text-decoration:none}
  .logo-mark{width:40px;height:40px;background:#E05A2B;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;color:#fff}
  .logo-name{font-size:16px;font-weight:700;color:#fff}
  .logo-name span{display:block;font-size:10px;font-weight:400;color:rgba(255,255,255,.5);letter-spacing:1px;text-transform:uppercase}
  .body{padding:40px}
  h1{font-size:22px;color:#0A1F44;margin:0 0 8px}
  p{font-size:14px;color:#5A6A85;line-height:1.75;margin:0 0 16px}
  .btn{display:inline-block;background:#E05A2B;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:12px;margin:8px 0 20px}
  .footer{background:#f8faff;padding:20px 40px;font-size:12px;color:#95A3BC;border-top:1px solid #E2E8F4}
</style></head><body>
<div class="wrap">
  <div class="header">
    <div class="logo">
      <div class="logo-mark">F</div>
      <div class="logo-name">Fristine Infotech<span>Zoho Premium Partner</span></div>
    </div>
  </div>
  <div class="body">
    <h1>Hi ${company} Team 👋</h1>
    <p>Thank you for your interest in Zoho solutions with <strong>Fristine Infotech</strong>. We've prepared a personalised AI discovery session just for you.</p>
    <p>Click the button below to start your complimentary presales session. Our AI-powered consultant will guide you through a 5-10 minute discovery call to understand your business needs and generate a tailored proposal.</p>
    <a href="${botUrl}" class="btn">Start Discovery Session →</a>
    <p style="font-size:12px;color:#95A3BC">Or paste this link in your browser:<br/><a href="${botUrl}" style="color:#E05A2B;word-break:break-all">${botUrl}</a></p>
    <p style="font-size:12px;color:#95A3BC">Session ID: <code>${clientId}</code></p>
  </div>
  <div class="footer">
    &copy; Fristine Infotech · India's Leading Premium Zoho Partner · <a href="https://fristinetech.com" style="color:#E05A2B">fristinetech.com</a>
  </div>
</div>
</body></html>`;
}

/* POST /api/email/send-bot */
router.post('/send-bot', async (req, res) => {
  const { to, company, clientId, botUrl } = req.body;
  if (!to || !clientId || !botUrl) {
    return res.status(400).json({ error: 'to, clientId, and botUrl are required' });
  }

  const transporter = buildTransporter();
  if (!transporter) {
    // Simulate success if no SMTP configured
    console.log(`[Email SIMULATED] Would send bot link to ${to} for ${company} (${clientId})`);
    console.log(`  Bot URL: ${botUrl}`);
    return res.json({ success: true, simulated: true });
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject: `Your Personalised Zoho Discovery Session — ${company}`,
      html: buildBotEmailHtml({ company, clientId, botUrl }),
    });
    console.log(`[Email] Sent bot link to ${to} for ${company}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Email] Send failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
