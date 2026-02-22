const nodemailer = require("nodemailer");
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
  return t.sendMail({ from: env.EMAIL_FROM, to, subject, text, html });
}

async function sendTicketConfirmation(registration, ticket, qrDataUrl) {
  const serial = registration.serial;
  const typeLabel =
    {
      free: "Free Entry",
      paid: "Paid Entry",
      guest: "Special Guest",
      volunteer: "Volunteer",
    }[registration.ticket_type] || registration.ticket_type;

  await sendMail({
    to: registration.email,
    subject: `Your ticket for LocalHost — ${serial}`,
    text: [
      `Hi ${registration.name || "there"},`,
      "",
      `Your ticket is confirmed! Serial: ${serial}`,
      `Type: ${typeLabel}`,
      registration.plus_one
        ? "You have a +1 — your companion must arrive with you."
        : "",
      "",
      "Show the QR code at the gate. Do not share it — it is single-use.",
      "",
      "See you there!",
      "— LocalHost Team",
    ].join("\n"),
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
