const nodemailer = require("nodemailer");
const path = require("path");
const env = require("./env");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (env.SMTP_USER && env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      tls: {
        rejectUnauthorized: false,
      },
    });
    console.log("[Email] SMTP transporter configured");
  } else {
    // Mock transporter — logs to console
    transporter = {
      sendMail: async (opts) => {
        console.log("\n📧 [EMAIL MOCK] ─────────────────────────────");
        console.log(`  To:      ${opts.to}`);
        console.log(`  Subject: ${opts.subject}`);
        console.log(`  Body:    ${opts.text || "(html)"}`);
        console.log("─────────────────────────────────────────────\n");
        return { messageId: "mock-" + Date.now() };
      },
    };
    console.log("[Email] No SMTP config — using console mock");
  }
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();
  try {
    const info = await t.sendMail({
      from: env.EMAIL_FROM,
      to,
      subject,
      text,
      html,
    });
    console.log(`[Email] Sent to ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error("[Email Error] Failed to send to", to);
    console.error(" - Error Message:", error.message);
    if (error.code) console.error(" - Code:", error.code);
    if (error.response) console.error(" - Response:", error.response);
    throw error;
  }
}

const path = require("path");

async function sendTicketConfirmation(registration, ticketId, qrDataUrl) {
  const serial = registration.serial;
  const typeLabel =
    {
      free: "Free Entry",
      paid: "Paid Entry",
      vip: "VIP / Paid Entry",
      guest: "Special Guest",
      volunteer: "Volunteer",
    }[registration.ticket_type] || registration.ticket_type;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f0f4f3; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f0f4f3; padding: 40px 0; }
        .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; color: #2f4f4f; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(47,79,79,0.1); }
        .banner { width: 100%; height: 200px; object-fit: cover; }
        .header { background-color: #2f4f4f; padding: 50px 20px; text-align: center; color: #f5f5dc; }
        .logo-img { width: 60px; height: 60px; margin-bottom: 15px; border-radius: 12px; }
        .header h1 { margin: 0; font-size: 26px; letter-spacing: 3px; text-transform: uppercase; font-weight: 300; }
        .header .subtitle { font-size: 10px; opacity: 0.7; margin-top: 8px; letter-spacing: 2px; }
        .content { padding: 50px 40px; line-height: 1.8; }
        .greeting { font-size: 22px; font-weight: 700; margin-bottom: 24px; color: #1a3030; }
        .ticket-card { background: linear-gradient(135deg, #e8f0ef 0%, #d2e4e1 100%); border-radius: 20px; padding: 40px; text-align: center; margin: 30px 0; border: 1px solid rgba(47,79,79,0.1); }
        .qr-wrapper { background: #ffffff; padding: 20px; display: inline-block; border-radius: 16px; margin-bottom: 25px; box-shadow: 0 8px 24px rgba(47,79,79,0.08); }
        .serial { font-family: 'Courier New', Courier, monospace; font-size: 20px; font-weight: bold; color: #2f4f4f; letter-spacing: 2px; background: rgba(255,255,255,0.5); padding: 8px 16px; border-radius: 6px; display: inline-block; }
        .info-grid { width: 100%; margin-top: 30px; border-top: 1px solid rgba(47,79,79,0.1); padding-top: 30px; border-collapse: collapse; }
        .info-item { padding: 10px 0; }
        .info-label { font-size: 10px; text-transform: uppercase; color: #6b8481; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 4px; }
        .info-value { font-size: 15px; font-weight: 600; color: #1a3030; }
        .btn-box { text-align: center; margin-top: 40px; }
        .btn { display: inline-block; background: #2f4f4f; color: #f5f5dc !important; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; letter-spacing: 1px; box-shadow: 0 4px 12px rgba(47,79,79,0.2); }
        .footer { text-align: center; font-size: 12px; color: #6b8481; padding: 30px 20px; }
        .footer a { color: #2f4f4f; text-decoration: none; font-weight: 600; }
        .notice { font-size: 13px; color: #6b8481; padding: 20px; background: #f9fbfb; border-radius: 8px; margin-top: 30px; border-left: 4px solid #2f4f4f; }
      </style>
    </head>
    <body>
      <center class="wrapper">
        <table class="main">
          <tr>
            <td>
              <img src="cid:banner" class="banner" alt="LocalHost Festival">
            </td>
          </tr>
          <tr>
            <td class="header">
              <img src="cid:logo" class="logo-img" alt="LocalHost Logo">
              <h1>LOCAL&middot;HOST</h1>
              <div class="subtitle">MEDIA &times; STARTUP LAB</div>
            </td>
          </tr>
          <tr>
            <td class="content">
              <div class="greeting">Hi ${registration.name || "there"},</div>
              <p>Your journey with <strong>LocalHost Festival 2026</strong> begins here. We've reserved your spot at our global lab for creators and innovators.</p>
              
              <div class="ticket-card">
                <div class="qr-wrapper">
                  <img src="cid:qrcode" width="220" height="220" alt="Ticket QR Code">
                </div>
                <br>
                <div class="serial">${serial}</div>
                <div style="margin-top: 15px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6b8481;">Pass ID</div>
              </div>

              <table class="info-grid">
                <tr>
                  <td class="info-item" width="50%">
                    <div class="info-label">Entry Type</div>
                    <div class="info-value">${typeLabel}</div>
                  </td>
                  <td class="info-item" width="50%">
                    <div class="info-label">Date</div>
                    <div class="info-value">March 15, 2026</div>
                  </td>
                </tr>
                <tr>
                  <td class="info-item">
                    <div class="info-label">Plus One</div>
                    <div class="info-value">${registration.plus_one ? "Guaranteed" : "Standard"}</div>
                  </td>
                  <td class="info-item">
                    <div class="info-label">Location</div>
                    <div class="info-value">Main Lab Area</div>
                  </td>
                </tr>
              </table>

              <div class="btn-box">
                <a href="${env.SITE_URL || "https://localhost.isthismyportfolio.site"}/api/tickets/view/${ticketId}" class="btn">DOWNLOAD / PRINT PASS →</a>
              </div>

              <div class="notice">
                <strong>Important:</strong> Present this QR code or a printed copy at the gate. If you have a +1, your companion must enter with you. Pass is non-transferable and valid for one-time entry only.
              </div>
            </td>
          </tr>
        </table>
        <div class="footer">
          <p>&copy; 2026 LocalHost Media Lab. Built by Creators, for Creators.<br/>
          <a href="https://localhosthq.com">localhosthq.com</a> | <a href="${env.SITE_URL || "https://localhost.isthismyportfolio.site"}/user">Member Portal</a></p>
        </div>
      </center>
    </body>
    </html>
  `;

  // Attachments
  const qrBase64 = qrDataUrl ? qrDataUrl.split(",")[1] : null;
  const sharedDir = path.join(__dirname, "../../public/shared");

  const attachments = [
    {
      filename: "logo.png",
      path: path.join(sharedDir, "favicon.png"), // Use the generated PNG logo as fallback for email
      cid: "logo",
    },
    {
      filename: "banner.webp",
      path: path.join(sharedDir, "banner.webp"),
      cid: "banner",
    },
  ];

  if (qrBase64) {
    attachments.push({
      filename: "qrcode.png",
      content: qrBase64,
      encoding: "base64",
      cid: "qrcode",
    });
  }

  await sendMail({
    to: registration.email,
    subject: `[Pass Confirmed] ${serial} — LocalHost Festival`,
    html,
    attachments,
  });
}

async function sendDrawWinnerEmail(registration) {
  await sendMail({
    to: registration.email,
    subject: "You won the LocalHost Lucky Draw! 🎉",
    text: `Hi ${registration.name || "there"},\n\nGreat news — you have been selected in the lucky draw!\nYour ticket (${registration.serial}) has been confirmed. Check your next email for your QR code.\n\n— LocalHost Team`,
  });
}

async function sendDrawLoserEmail(email, name) {
  await sendMail({
    to: email,
    subject: "LocalHost Draw Result",
    text: `Hi ${name || "there"},\n\nThank you for entering the draw. Unfortunately, you were not selected this time.\nKeep an eye on our socials for future events.\n\n— LocalHost Team`,
  });
}

async function sendWaitlistPromoEmail(registration) {
  await sendMail({
    to: registration.email,
    subject: "A paid seat opened up — your chance to register!",
    text: `Hi ${registration.name || "there"},\n\nA paid ticket slot just opened up. Head to the registration page to complete your purchase before it fills up again.\n\n— LocalHost Team`,
  });
}

module.exports = {
  sendMail,
  sendTicketConfirmation,
  sendDrawWinnerEmail,
  sendDrawLoserEmail,
  sendWaitlistPromoEmail,
};
