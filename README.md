# 🎫 Event Arranger - LocalHost Ticketing System

[![Localhost](https://img.shields.io/badge/Powered%20By-Localhost-black?style=for-the-badge&logo=target)](https://localhosthq.com/)
[![GitHub Stars](https://img.shields.io/github/stars/gtxPrime/event-arranger?style=social)](https://github.com/gtxPrime/event-arranger)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Robust, Zero-Dependency Infrastructure for [Localhosthq.com](https://localhosthq.com/) - A Global Media & Startup Lab.**

Event Arranger is an industrial-grade, full-stack ticketing engine designed to handle high-traffic event registrations, automated lucky draws, and secure gate management. Built for the **Localhost** community, it simplifies the complex logistics of managing global labs and creative festivals.

---

## 🚀 Ecosystem Overview

- **👤 User Portal:** [localhost.isthismyportfolio.site/user](https://localhost.isthismyportfolio.site/user)  
  _High-performance landing page with interactive tiers and parallax visuals._
- **🛠 Admin Dashboard:** [localhost.isthismyportfolio.site/admin](https://localhost.isthismyportfolio.site/admin)  
  _Command center for settings, statistics, guest management, and manual draws._
- **📷 Gate Scanner:** [localhost.isthismyportfolio.site/scanner](https://localhost.isthismyportfolio.site/scanner)  
  _Optimized mobile PWA for instant QR validation with square camera cropping._
- **🔒 Özel Access:** [localhost.isthismyportfolio.site/guest](https://localhost.isthismyportfolio.site/guest)  
  _Invite-only registration flow via encrypted guest codes._

---

## ✨ Core Pillars

### 1. Robust Architecture (Zero-Native)

Unlike systems relying on `better-sqlite3` or `bcrypt`, this engine uses **Pure WebAssembly (WASM)**.

- **Database:** `node-sqlite3-wasm` ensures the project runs on any shared hosting (Hostinger/cPanel) without requiring C++ build tools or native compilation.
- **Security:** Pure-JS `bcryptjs` for portable password hashing.

### 2. Intelligent Automation

- **Auto-Draw System:** Integrated scheduler selects winners from "pending_draw" pool based on custom offsets.
- **Payment Expiry:** Automated cleanup job releases locked seats if payments aren't confirmed within the X-minute window.
- **Bulk Processing:** Industrial CSV parser to import hundreds of registrations with automatic ticket issuance and email delivery.

### 3. Security & Integrity

- **HMAC QR Signing:** Every ticket QR code is cryptographically signed using a unique registration secret to prevent tampering or forged entries.
- **Audit Logging:** Every administrative action (Approvals, Revocations, Settings changes) is logged with the admin's ID and timestamp.
- **Adaptive Rate Limiting:** Granular limits for Auth, Registration, and Scanning to mitigate DDoS and brute-force attempts.

### 4. Premium Communication

- **Redesigned Email Engine:** Beautifully crafted "Member Pass" templates featuring:
  - Responsive CID-embedded images (Banner & Logo).
  - High-precision QR codes.
  - Plain-text fallbacks for 100% deliverability.

---

## 📁 Project Structure

```bash
├── public/                 # Static Frontend Assets
│   ├── user/               # Main registration portal & checkout
│   ├── admin/              # Management dashboard
│   ├── scanner/            # QR validation PWA
│   ├── guest/              # Invite-only registration flow
│   └── shared/             # Global CSS, Images (Banner/Logo)
├── server/                 # Backend Core (Node.js/Express)
│   ├── routes/             # API Endpoints (Auth, Scan, Admin, etc.)
│   ├── middleware/         # Audit Logs, Rate Limiting, Proxy Trust
│   ├── config/             # Email templates & Env wrappers
│   ├── utils/              # SQLite-WASM shim, QR HMAC, Serial gens
│   └── db.js               # Migrations & Seeders
├── data/                   # Dynamic storage (SQLite .db)
├── .env.example            # Environment template
└── send-demo-email.js      # Mail system verification tool
```

---

## 💻 Installation & Deployment

### Local Development

1. **Clone & Install:**
   ```bash
   git clone https://github.com/gtxPrime/event-arranger.git
   npm install
   ```
2. **Environment:** Copy `.env.example` to `.env` and fill in SMTP/Google credentials.
3. **Run:** `npm run dev` (starts on port 3000 by default).

### 🌐 cPanel / Shared Hosting (The Professional Way)

This project is pre-optimized for cPanel Node.js Selector.

1. **Prepare:** Run `npm run build-zip` (or manually zip everything except `node_modules`).
2. **Upload:** Use cPanel File Manager to upload and extract in your app directory.
3. **App Setup:**
   - Application Root: `/your-path`
   - Startup File: `server/index.js`
4. **Data Folder:** Ensure the `data/` directory exists and has write permissions.

---

## 🛠 Management CLI

The system includes utility scripts for maintenance:

- **Test Mail:** `node send-demo-email.js`  
  _Verifies SMTP connectivity and image CID embedding._
- **Database Migration:** Automatically runs on startup via `server/db.js`.
- **Admin Reset:** Use the `.env` default variables to regain access to the dashboard.

---

## 🤝 Contributing

1. Fork the Project.
2. Create Feature Branch.
3. Commit Changes.
4. Open Pull Request.

---

## 📄 License & Credits

Developed by **[gtxPrime](https://github.com/gtxPrime)** for **[Localhost Media Lab](https://localhosthq.com/)**.  
Distributed under the **MIT License**.

_"The journey begins at the intersection of practice and technology."_
