require("dotenv").config();
const { sendTicketConfirmation } = require("./server/config/email");
const QRCode = require("qrcode");

async function sendDemo() {
  const demoEmail = "gtxprime.com@gmail.com";
  const dummyReg = {
    id: "demo-reg-" + Date.now(),
    serial: "DEMO-001",
    name: "Demo User",
    email: demoEmail,
    ticket_type: "free",
    plus_one: 0,
  };

  const dummyTicketId = "demo-ticket-" + Date.now();
  const qrDataUrl = await QRCode.toDataURL("DEMO-QR-DATA");

  console.log(`🚀 Sending premium demo email to ${demoEmail}...`);
  try {
    await sendTicketConfirmation(dummyReg, dummyTicketId, qrDataUrl);
    console.log(
      "✅ Demo email sent successfully! Check your inbox for images.",
    );
  } catch (err) {
    console.error("❌ Failed to send demo email:", err.message);
  }
}

sendDemo();
