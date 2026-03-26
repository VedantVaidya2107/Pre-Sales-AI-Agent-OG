import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/email", tags=["Email"])

class SendBotRequest(BaseModel):
    to: str
    company: str
    clientId: str
    botUrl: str

def build_bot_email_html(company: str, clientId: str, botUrl: str) -> str:
    return f"""
<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{{font-family:'Segoe UI',sans-serif;background:#f4f6fb;margin:0;padding:0}}
  .wrap{{max-width:540px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}}
  .header{{background:#0A1F44;padding:32px 40px;text-align:center}}
  .logo{{display:inline-flex;align-items:center;gap:10px;color:#fff;text-decoration:none}}
  .logo-mark{{width:40px;height:40px;background:#E05A2B;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;color:#fff}}
  .logo-name{{font-size:16px;font-weight:700;color:#fff}}
  .body{{padding:40px}}
  h1{{font-size:22px;color:#0A1F44;margin:0 0 8px}}
  p{{font-size:14px;color:#5A6A85;line-height:1.75;margin:0 0 16px}}
  .btn{{display:inline-block;background:#E05A2B;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:12px;margin:8px 0 20px}}
  .footer{{background:#f8faff;padding:20px 40px;font-size:12px;color:#95A3BC;border-top:1px solid #E2E8F4}}
</style></head><body>
<div class="wrap">
  <div class="header">
    <div class="logo">
      <div class="logo-mark">F</div>
      <div class="logo-name">Fristine Infotech</div>
    </div>
  </div>
  <div class="body">
    <h1>Hi {company} Team 👋</h1>
    <p>We've prepared a personalised AI discovery session just for you.</p>
    <a href="{botUrl}" class="btn">Start Discovery Session →</a>
    <p style="font-size:12px;color:#95A3BC">Session ID: <code>{clientId}</code></p>
  </div>
  <div class="footer">
    &copy; Fristine Infotech
  </div>
</div>
</body></html>
"""

@router.post("/send-bot")
def send_bot(req: SendBotRequest):
    user = os.environ.get("EMAIL_USER")
    password = os.environ.get("EMAIL_PASS")
    
    if not user or not password:
        raise HTTPException(
            status_code=500, 
            detail="Email credentials (EMAIL_USER/EMAIL_PASS) missing in server environment. Please set them in your Render dashboard."
        )
        
    try:
        msg = MIMEMultipart()
        msg['From'] = os.environ.get("EMAIL_FROM", user)
        msg['To'] = req.to
        msg['Subject'] = f"Your Personalised Zoho Discovery Session — {req.company}"
        
        html_content = build_bot_email_html(req.company, req.clientId, req.botUrl)
        msg.attach(MIMEText(html_content, 'html'))
        
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(user, password)
        server.send_message(msg)
        server.quit()
        
        print(f"[Email] Sent bot link to {req.to} for {req.company}")
        return {"success": True}
    except Exception as e:
        print(f"[Email] Send failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class SendProposalRequest(BaseModel):
    to: str
    company: str
    html: str

@router.post("/send-proposal")
def send_proposal(req: SendProposalRequest):
    user = os.environ.get("EMAIL_USER")
    password = os.environ.get("EMAIL_PASS")
    
    if not user or not password:
        raise HTTPException(
            status_code=500, 
            detail="Email credentials (EMAIL_USER/EMAIL_PASS) missing in server environment. Please set them in your Render dashboard."
        )
        
    try:
        msg = MIMEMultipart()
        msg['From'] = os.environ.get("EMAIL_FROM", user)
        msg['To'] = req.to
        msg['Subject'] = f"Your Fristine Infotech Proposal — {req.company}"
        
        body_html = f"""
        <html><body>
          <h2>Hi {req.company} Team,</h2>
          <p>Please find attached your custom proposal, prepared by your Fristine Presales specialist.</p>
          <p>Simply download the attached file and open it in any web browser to view your detailed roadmap.</p>
          <br/>
          <p>Best regards,<br/>Fristine Infotech Presales</p>
        </body></html>
        """
        msg.attach(MIMEText(body_html, 'html'))
        
        # Attach the HTML proposal file
        attachment = MIMEText(req.html, 'html')
        attachment.add_header('Content-Disposition', 'attachment', filename=f"{req.company.replace(' ', '_')}_Proposal.html")
        msg.attach(attachment)
        
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(user, password)
        server.send_message(msg)
        server.quit()
        
        print(f"[Email] Sent proposal file to {req.to} for {req.company}")
        return {"success": True}
    except Exception as e:
        print(f"[Email] Send failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
