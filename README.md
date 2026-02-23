# 🎫 Event Arranger - LocalHost Ticketing System

[![Localhost](https://img.shields.io/badge/Powered%20By-Localhost-black?style=for-the-badge&logo=target)](https://localhosthq.com/)
[![GitHub Stars](https://img.shields.io/github/stars/gtxPrime/event-arranger?style=social)](https://github.com/gtxPrime/event-arranger)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Core Infrastructure for [Localhosthq.com](https://localhosthq.com/) - A Global Media & Startup Lab.**

Event Arranger is a comprehensive, full-stack ticketing system purpose-built for the **Localhost** community—a global network empowering young creatives, high schoolers, and undergraduate students. This system manages registrations and ticketing for labs, festivals, and events globally.

---

## 🚀 Live Demo & Repository

**GitHub Repository:** [https://github.com/gtxPrime/event-arranger](https://github.com/gtxPrime/event-arranger)
**Organization:** [Localhost Media & Startup Lab](https://localhosthq.com/)

---

## ✨ Features

### 👤 User Interface

- **Modern Landing Page:** Stunning UI for event discovery and registration.
- **Dynamic Registration:** Flexible forms for user details.
- **Secure Checkout:** Integration-ready for various payment methods.
- **Instant Confirmation:** Automatic ticket generation and email notifications.

### 🛠 Admin Dashboard

- **Real-time Statistics:** Monitor registrations, ticket sales, and check-ins.
- **Guest Management:** View, export, and manage guest lists.
- **Admin Controls:** Secure access to sensitive event data.
- **Background Jobs:** Automated payment expiry and lucky draw schedulers.

### 📷 Gate Scanner

- **Web-based QR Scanner:** No extra hardware needed, uses any mobile browser.
- **Instant Validation:** Fast ticket verification with real-time feedback.
- **Entry Tracking:** Logs every entry for post-event analysis.

### 🔒 Security & Backend

- **Google OAuth:** Seamless login for admins and users.
- **Rate Limiting:** Protects API routes from abuse.
- **SQLite WASM:** High-performance database without complex setup.
- **Firebase Integration:** Secure storage and authentication options.

---

## 🛠 Tech Stack

| Component         | Technology                                                                                                                 |
| :---------------- | :------------------------------------------------------------------------------------------------------------------------- |
| **Backend**       | [Node.js](https://nodejs.org/) with [Express](https://expressjs.com/)                                                      |
| **Database**      | [SQLite WASM](https://www.sqlite.org/wasm) (zero-dependency storage)                                                       |
| **Auth**          | [Passport.js](https://www.passportjs.org/) (Google OAuth)                                                                  |
| **Email**         | [Nodemailer](https://nodemailer.com/)                                                                                      |
| **QR Generation** | [qrcode](https://www.npmjs.com/package/qrcode)                                                                             |
| **File Uploads**  | [Multer](https://github.com/expressjs/multer)                                                                              |
| **Security**      | [BcryptJS](https://www.npmjs.com/package/bcryptjs), [Express-Rate-Limit](https://www.npmjs.com/package/express-rate-limit) |

---

## 💻 Local Setup

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/gtxPrime/event-arranger.git
   cd event-arranger
   ```

2. **Install Dependencies:**

   ```bash
   npm install
   ```

3. **Environment Setup:**
   Create a `.env` file in the root directory (use `.env.example` as a template):

   ```env
   PORT=3000
   SESSION_SECRET=your_secret_here
   GOOGLE_CLIENT_ID=your_id
   GOOGLE_CLIENT_SECRET=your_secret
   # ... add other required keys
   ```

4. **Run the Application:**

   ```bash
   # Development mode (watching)
   npm run dev

   # Production mode
   npm start
   ```

---

## 🌐 Hosting Guide

### 1. Shared Hosting (cPanel / Hostinger / Bluehost)

Most modern shared hosting providers support Node.js applications.

1. **Setup Node.js App:** Look for "Setup Node.js App" in your cPanel.
2. **Upload Files:** Upload all files (excluding `node_modules`).
3. **Environment Variables:** Set the `.env` variables in the Node.js setup interface.
4. **Install Modules:** Use the "Run NPM Install" button in the cPanel interface.
5. **Start:** Set the "Application startup file" to `server/index.js`.

### 2. VPS Hosting (DigitalOcean / AWS / Linode)

1. **Connect:** SSH into your server.
2. **Install Node & PM2:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   sudo npm install -g pm2
   ```
3. **Deploy Code:** Clone your repo and install dependencies.
4. **Run with PM2:**
   ```bash
   pm2 start server/index.js --name event-arranger
   pm2 startup && pm2 save
   ```
5. **Nginx Reverse Proxy:** Configure Nginx to point your domain to the port specified in `.env`.

### 3. PaaS (Render / Railway / Northflank)

Simply connect your GitHub repository to these services. They will auto-detect the `package.json` and deploy it instantly.

- **Render:** Choose "Web Service" -> Connect Repo -> Set Publish Directory to `./` and Start Command to `npm start`.

---

## 🛠 Detailed Service Setup

### 📧 1. Mail Service (SMTP)

To send ticket confirmations, update your `.env` with your SMTP details.

- **Shared Hosting (cPanel):**
  - Host: `mail.yourdomain.com`
  - Port: `465` (SSL) or `587` (TLS)
  - User: `your-email@yourdomain.com`
  - Password: `your-email-password`

### 🔥 2. Firebase Setup

#### Web Config (Frontend)

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a project.
2. Add a **Web App** and copy the configuration to your `.env`:
   - `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`

#### Admin SDK (Server)

1. In Firebase Settings > Service Accounts, click **"Generate New Private Key"**.
2. Download the JSON file and upload it to your server's `server/` folder.
3. Update `.env`: `FIREBASE_SERVICE_ACCOUNT_PATH=./server/your-file-name.json`.

### 🔑 3. Google OAuth Login

1. In [Google Cloud Console](https://console.cloud.google.com/), go to **APIs & Services > Credentials**.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. **Authorized Redirect URIs:** Add `https://yourdomain.com/api/auth/google/callback`.
4. **Authorized JavaScript Origins:** Add `https://yourdomain.com`.
5. Copy the **Client ID** and **Client Secret** to your `.env`.
6. **Firebase Sync:** In the Firebase Console under Authentication > Sign-in method, ensure Google is enabled and the Authorized Domains list includes your production domain.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

**Developed with ❤️ by [gtxPrime](https://github.com/gtxPrime)**
