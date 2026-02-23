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

## ✨ Comprehensive Feature Set

We have integrated an extensive array of ticketing mechanisms to fit any modern event need. All limits, timers, and workflows are controllable via the Admin Dashboard.

### 1. Robust Ticket Registration Types

- **Free Tickets (First-Come-First-Serve + Lucky Draw):**
  - Registrations within the `fcfs_limit` are instantly approved.
  - Any subsequent registrations automatically placed in a `pending_draw` waitlist.
- **Paid & VIP Access (Time-Bound Payment Systems):**
  - Select multiple tickets per order.
  - Strict timestamped **Payment Locks**. If an order is not completed within `checkout_timeout_mins` (e.g., 5 mins), the reservation automatically expires and seats are recycled.
  - Automatic triggering of waitlist promo emails when paid tiers open up.
- **Special Invites / Guest Lists:**
  - Generate short tracking URL parameters (e.g. `?code=ABC234`) or long-form encrypted codes via the Admin panel.
  - Admins can configure: limit of registrations per code, `plus_one` accessibility, expiration dates, and toggles for Auto-Approve vs Manual Review.
- **Volunteer Ticketing:**
  - Restricted codes tied precisely to specific volunteer email addresses to ensure strict access control.

### 2. Intelligent Automation & Workflows

- **Automated Lucky Draw Executions:**
  - Automated background scheduler automatically fires the lucky draw before the event (controlled by `draw_run_offset_mins` before `event_start_epoch`).
  - Determines winners based on total remaining free capacity limits.
- **Time-Bound Email & Waitlist Promotions:**
  - Automatically dispatches promo invites to the next person in line if another user times out on their payment cart.
- **Bulk Processing & CSV Imports:**
  - Upload hundreds of guest details via CSV. The system will mass-generate UUIDs, serialize passes, and autonomously dispatch Member Pass ticket QR codes out via SMTP in seconds.

### 3. State-of-the-Art Premium Communication

Say goodbye to generic text notifications! All participant communication now utilizes state-of-the-art **Premium HTML Templates**, utilizing an incredibly sleek Dark-Mode "Member Pass" layout.

- **Ticket / QR Confirmations**: Attendees receive a stunning HTML email complete with CID-embedded visual event banners, logos, QR codes, and dynamically injected tier labels.
- **Lucky Draw Status Alerts**:
  - **Winners ($)** receive a beautifully themed digital celebration detailing their pass confirmation.
  - **Rejections / Draw Losers** receive a highly aesthetic, polite rejection notice with the exact same premium branding to maintain brand consistency and keep them engaged for the next event.
- **Special Invite Promotions**: Waitlist notifications leverage the unified visual identity to inspire urgency in completing paid transactions.

### 4. Integrity & High Security

- **QR Cryptography (`QR_HMAC_SECRET`)**: Every generated barcode contains an embedded HMAC signature mapping to its exact generation millisecond. The Gate Scanner re-hashes offline/online to instantly reject forged duplicates.
- **Cascade Revocation**: If a Master Guest List code is disabled by an Admin, _all individual QR tickets generated using that code instantly invalidate._
- **Zero-Native Operations**: Operates exclusively on pure WebAssembly SQLite. No `better-sqlite3` build chain issues, meaning deploying to CPanel, Hostinger, or a Pi is 100% painless.

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
│   ├── config/             # Premium HTML Email templates & Env wrappers
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
  _Verifies SMTP connectivity and tests multi-CID image embedding to preview templates._
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
Distributed under good faith.

_"The journey begins at the intersection of practice and technology."_
