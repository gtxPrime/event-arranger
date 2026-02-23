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

async function sendMail({ to, subject, text, html, attachments }) {
  const t = getTransporter();
  try {
    const info = await t.sendMail({
      from: env.EMAIL_FROM,
      to,
      subject,
      text,
      html,
      attachments,
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

async function sendTicketConfirmation(registration, ticketId, qrDataUrl) {
  const serial = registration.serial;
  const typeLabel =
    {
      free: "Free Entry",
      paid: "Paid Entry",
      vip: "VIP Access",
      guest: "Special Guest",
      volunteer: "Volunteer",
    }[registration.ticket_type] || registration.ticket_type;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { margin: 0; padding: 0; background-color: #0c0a09; }
        .wrapper { 
          width: 100%; 
          background-color: #0c0a09; 
          background-image: url('cid:banner'); 
          background-size: cover; 
          background-position: center; 
          padding: 80px 20px; 
          font-family: 'Helvetica Neue', Arial, sans-serif;
        }
        .card { 
          max-width: 480px; 
          margin: 0 auto; 
          background-color: #ffffff; 
          border-radius: 40px; 
          overflow: hidden; 
          box-shadow: 0 50px 100px rgba(0,0,0,0.8);
        }
        .card-header { padding: 50px 30px 0; text-align: center; }
        .logo-img { width: 50px; height: 50px; border-radius: 14px; }
        .card-body { padding: 40px; text-align: center; color: #2f4f4f; }
        .qr-box { background: #fff; padding: 25px; border-radius: 24px; display: inline-block; box-shadow: 0 15px 35px rgba(47,79,79,0.08); margin-bottom: 30px; border: 1px solid #f0f0f0; }
        .serial { font-family: 'Courier New', Courier, monospace; font-size: 24px; font-weight: bold; color: #1a3030; letter-spacing: 3px; }
        .label { font-size: 10px; text-transform: uppercase; color: #6b8481; letter-spacing: 2px; font-weight: 700; margin-bottom: 6px; }
        .value { font-size: 18px; font-weight: 600; color: #1a3030; }
        .info-table { width: 100%; margin: 40px 0; border-top: 1px solid #efefef; padding-top: 30px; border-collapse: collapse; }
        .btn { display: block; background: #2f4f4f; color: #f5f5dc !important; padding: 22px; text-decoration: none; border-radius: 20px; font-weight: 700; font-size: 15px; letter-spacing: 2px; margin-top: 40px; }
        .footer { text-align: center; padding: 50px 20px; color: #6b8481; font-size: 12px; }
        .footer a { color: #f5f5dc; text-decoration: none; font-weight: 600; }
      </style>
    </head>
    <body style="margin:0; padding:0; background-color:#0c0a09;">
      <center class="wrapper" style="width:100%; background-color:#0c0a09; background-image:url('cid:banner'); background-size:cover; background-position:center; padding:80px 0;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px;">
          <tr>
            <td style="padding: 10px 20px;">
              <div class="card" style="background-color: #ffffff; border-radius: 40px; overflow: hidden; box-shadow: 0 40px 80px rgba(0,0,0,0.6);">
                <div class="card-header" style="padding: 50px 30px 0; text-align: center;">
                  <img src="cid:logo" class="logo-img" width="50" height="50" style="border-radius: 14px;">
                  <h2 style="margin: 20px 0 5px; font-size: 26px; letter-spacing: 2px; color: #1a3030; font-family: serif;">MEMBER PASS</h2>
                  <div style="font-size: 11px; color: #6b8481; text-transform: uppercase; letter-spacing: 3px; font-weight: 700;">LocalHost Festival 2026</div>
                </div>
                
                <div class="card-body" style="padding: 50px 40px; text-align: center;">
                  <div class="qr-box" style="background:#fff; padding:25px; border-radius:24px; display:inline-block; border:1px solid #f0f0f0; margin-bottom:35px;">
                    <img src="cid:qrcode" width="220" height="220" alt="QR Code">
                  </div>
                  
                  <div class="serial" style="font-family:monospace; font-size:24px; font-weight:bold; color:#1a3030; letter-spacing:3px;">${serial}</div>
                  
                  <table width="100%" style="margin: 45px 0; border-top: 1px solid #efefef; padding-top: 35px; border-collapse: collapse;">
                    <tr>
                      <td align="left" width="50%">
                        <div style="font-size:10px; text-transform:uppercase; color:#6b8481; letter-spacing:2px; font-weight:700; margin-bottom:6px;">Attendee</div>
                        <div style="font-size:18px; font-weight:600; color:#1a3030;">${registration.name}</div>
                      </td>
                      <td align="right" width="50%">
                        <div style="font-size:10px; text-transform:uppercase; color:#6b8481; letter-spacing:2px; font-weight:700; margin-bottom:6px;">Pass Type</div>
                        <div style="font-size:18px; font-weight:600; color:#1a3030;">${typeLabel}</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" style="padding-top: 30px;">
                        <div style="font-size:10px; text-transform:uppercase; color:#6b8481; letter-spacing:2px; font-weight:700; margin-bottom:6px;">Location</div>
                        <div style="font-size:18px; font-weight:600; color:#1a3030;">Main Lab</div>
                      </td>
                      <td align="right" style="padding-top: 30px;">
                        <div style="font-size:10px; text-transform:uppercase; color:#6b8481; letter-spacing:2px; font-weight:700; margin-bottom:6px;">Date</div>
                        <div style="font-size:18px; font-weight:600; color:#1a3030;">Mar 15</div>
                      </td>
                    </tr>
                  </table>

                  <a href="${env.SITE_URL || "https://localhost.isthismyportfolio.site"}/api/tickets/view/${ticketId}" style="display:block; background:#2f4f4f; color:#f5f5dc; padding:22px; text-decoration:none; border-radius:20px; font-weight:700; font-size:15px; letter-spacing:2px; margin-top:10px;">DOWNLOAD TICKET</a>
                  
                  <p style="font-size: 13px; color: #6b8481; margin-top: 40px; line-height: 1.6; font-style: italic;">"The journey begins at the intersection of practice and technology."</p>
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="text-align:center; padding:50px 20px; color:#6b8481; font-size:12px;">
              <div style="margin-bottom: 10px;">&copy; 2026 LocalHost Media Lab</div>
              <a href="https://localhosthq.com" style="color: #f5f5dc; text-decoration: none; border-bottom: 1px solid rgba(245,245,220,0.3);">localhosthq.com</a>
            </td>
          </tr>
        </table>
      </center>
    </body>
    </html>
  `;

  const text = `
Hi ${registration.name || "there"},

Your ticket for LocalHost Festival 2026 is confirmed!

PASS ID: ${serial}
ENTRY TYPE: ${typeLabel}

DOWNLOAD / PRINT YOUR PASS:
${env.SITE_URL || "https://localhost.isthismyportfolio.site"}/api/tickets/view/${ticketId}

See you there!
— LocalHost Team
  `.trim();

  // Attachments
  const qrBase64 = qrDataUrl ? qrDataUrl.split(",")[1] : null;
  const sharedDir = path.join(__dirname, "../../public/shared");

  const attachments = [
    {
      filename: "logo.png",
      path: path.join(sharedDir, "logo.png"),
      cid: "logo",
    },
    {
      filename: "banner.webp",
      path: path.join(sharedDir, "banner.webp"), // This is the high-quality visual from the user screen
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
    text,
    html,
    attachments,
  });
}

function getBaseHtml(title, preheader, contentHtml) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { margin: 0; padding: 0; background-color: #0c0a09; }
        .wrapper { 
          width: 100%; 
          background-color: #0c0a09; 
          background-image: url('cid:banner'); 
          background-size: cover; 
          background-position: center; 
          padding: 80px 20px; 
          font-family: 'Helvetica Neue', Arial, sans-serif;
        }
        .card { 
          max-width: 480px; 
          margin: 0 auto; 
          background-color: #ffffff; 
          border-radius: 40px; 
          overflow: hidden; 
          box-shadow: 0 50px 100px rgba(0,0,0,0.8);
        }
        .card-header { padding: 50px 30px 0; text-align: center; }
        .logo-img { width: 50px; height: 50px; border-radius: 14px; }
        .card-body { padding: 40px; text-align: center; color: #2f4f4f; }
        .btn { display: block; background: #2f4f4f; color: #f5f5dc !important; padding: 22px; text-decoration: none; border-radius: 20px; font-weight: 700; font-size: 15px; letter-spacing: 2px; margin-top: 40px; }
        .footer { text-align: center; padding: 50px 20px; color: #6b8481; font-size: 12px; }
        .footer a { color: #f5f5dc; text-decoration: none; font-weight: 600; }
      </style>
    </head>
    <body style="margin:0; padding:0; background-color:#0c0a09;">
      <center class="wrapper" style="width:100%; background-color:#0c0a09; background-image:url('cid:banner'); background-size:cover; background-position:center; padding:80px 0;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px;">
          <tr>
            <td style="padding: 10px 20px;">
              <div class="card" style="background-color: #ffffff; border-radius: 40px; overflow: hidden; box-shadow: 0 40px 80px rgba(0,0,0,0.6);">
                <div class="card-header" style="padding: 50px 30px 0; text-align: center;">
                  <img src="cid:logo" class="logo-img" width="50" height="50" style="border-radius: 14px;">
                  <h2 style="margin: 20px 0 5px; font-size: 26px; letter-spacing: 2px; color: #1a3030; font-family: serif;">${title}</h2>
                  <div style="font-size: 11px; color: #6b8481; text-transform: uppercase; letter-spacing: 3px; font-weight: 700;">${preheader}</div>
                </div>
                <div class="card-body" style="padding: 50px 40px; text-align: center;">
                  ${contentHtml}
                  <p style="font-size: 13px; color: #6b8481; margin-top: 40px; line-height: 1.6; font-style: italic;">"The journey begins at the intersection of practice and technology."</p>
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="text-align:center; padding:50px 20px; color:#6b8481; font-size:12px;">
              <div style="margin-bottom: 10px;">&copy; 2026 LocalHost Media Lab</div>
              <a href="https://localhosthq.com" style="color: #f5f5dc; text-decoration: none; border-bottom: 1px solid rgba(245,245,220,0.3);">localhosthq.com</a>
            </td>
          </tr>
        </table>
      </center>
    </body>
    </html>
  `;
}

function getBaseAttachments() {
  const sharedDir = path.join(__dirname, "../../public/shared");
  return [
    {
      filename: "logo.png",
      path: path.join(sharedDir, "logo.png"),
      cid: "logo",
    },
    {
      filename: "banner.webp",
      path: path.join(sharedDir, "banner.webp"),
      cid: "banner",
    },
  ];
}

async function sendDrawWinnerEmail(registration) {
  const text = `Hi ${registration.name || "there"},\n\nGreat news — you have been selected in the lucky draw!\nYour ticket (${registration.serial}) has been confirmed. Check your next email for your QR code.\n\n— LocalHost Team`;

  const htmlContent = `
    <h3 style="color:#1a3030; font-size:22px;">Congratulations! 🎉</h3>
    <p style="font-size:16px; color:#2f4f4f; line-height:1.5; margin:20px 0;">
      Hi ${registration.name || "there"},<br><br>
      Great news — you have been selected in the lucky draw! Your ticket (<strong>${registration.serial}</strong>) is now confirmed.
    </p>
    <p style="font-size:16px; color:#2f4f4f; line-height:1.5;">Check your next email for your Member Pass QR code.</p>
  `;

  await sendMail({
    to: registration.email,
    subject: "You won the LocalHost Lucky Draw! 🎉",
    text,
    html: getBaseHtml("LUCKY DRAW", "LocalHost Festival 2026", htmlContent),
    attachments: getBaseAttachments(),
  });
}

async function sendDrawLoserEmail(email, name) {
  const text = `Hi ${name || "there"},\n\nThank you for entering the draw. Unfortunately, you were not selected this time.\nKeep an eye on our socials for future events.\n\n— LocalHost Team`;

  const htmlContent = `
    <h3 style="color:#1a3030; font-size:22px;">Draw Results</h3>
    <p style="font-size:16px; color:#2f4f4f; line-height:1.5; margin:20px 0;">
      Hi ${name || "there"},<br><br>
      Thank you for entering the draw. Unfortunately, you were not selected this time.
    </p>
    <p style="font-size:16px; color:#2f4f4f; line-height:1.5;">Keep an eye on our socials for future events and upcoming opportunities.</p> `;

  await sendMail({
    to: email,
    subject: "LocalHost Draw Result",
    text,
    html: getBaseHtml("DRAW STATUS", "LocalHost Festival 2026", htmlContent),
    attachments: getBaseAttachments(),
  });
}

async function sendWaitlistPromoEmail(registration) {
  const siteUrl = env.SITE_URL || "https://localhost.isthismyportfolio.site";
  const text = `Hi ${registration.name || "there"},\n\nA paid ticket slot just opened up. Head to the registration page to complete your purchase before it fills up again.\n\n— LocalHost Team`;

  const htmlContent = `
    <h3 style="color:#1a3030; font-size:22px;">A Seat Opened Up!</h3>
    <p style="font-size:16px; color:#2f4f4f; line-height:1.5; margin:20px 0;">
      Hi ${registration.name || "there"},<br><br>
      A paid ticket slot just opened up. Complete your purchase before it fills up again!
    </p>
    <a href="${siteUrl}/user/checkout" class="btn" style="display:block; background:#2f4f4f; color:#f5f5dc !important; padding:22px; text-decoration:none; border-radius:20px; font-weight:700; font-size:15px; letter-spacing:2px; margin-top:30px;">REGISTER NOW</a>
  `;

  await sendMail({
    to: registration.email,
    subject: "A paid seat opened up — your chance to register!",
    text,
    html: getBaseHtml("VIP ACCESS", "LocalHost Festival 2026", htmlContent),
    attachments: getBaseAttachments(),
  });
}

module.exports = {
  sendMail,
  sendTicketConfirmation,
  sendDrawWinnerEmail,
  sendDrawLoserEmail,
  sendWaitlistPromoEmail,
};
