# ⚽ CoachTrack ET | Telegram Mini App (TMA)

A pitch-side Telegram Mini App (TMA) and mobile web app built specifically for soccer coaches to replace manual spreadsheet logging, auto-calculate decimal hours, track attendance, and automate Ethiopian Birr (ETB) billing statements for parents and academies.

---

## 🚀 Key Features

1. **Pitch-Side Live Stopwatch**:
   - 1-tap "Start Practice" captures exact start time.
   - Background persistence: if coach receives a phone call or closes Telegram, the timer continues without losing a second.
   - 1-tap "Finish & Log" automatically calculates decimal hours (e.g., `14:20` to `17:50` = `3.50 hrs`, `15:20` to `18:00` = `2.67 hrs`).

2. **1-Tap Weather / Rain Cancellation**:
   - Tapping "Log Rain / Cancellation" records a `NO PRACTICE` row with notes (e.g. Rain, Pitch Flooded, Holiday) and sets 0 hours without disturbing billing formulas.

3. **Preloaded Timesheet (June 2026)**:
   - Comes preloaded with the exact data from your original spreadsheet (Sessions #1, #2, #4, #5, #6, #7, #8).
   - Shows status badges (`YES` in emerald green, `NO PRACTICE` in rose red).

4. **Automated ETB Financials & Parent Invoicing**:
   - Automatically computes: `Completed Sessions × Attendance × Rate/Kid/Session` (e.g., `6 × 4 × 1,000 ETB = 24,000 ETB`).
   - Generates an official verified statement with Ethiopian payment options:
     - **Telebirr** (with 1-click copy)
     - **Commercial Bank of Ethiopia (CBE)** account details
   - 1-tap **"Share to Telegram"** sends a formatted summary directly to parent group chats.

5. **Instant CSV & Google Sheets Real-Time Sync**:
   - **Export CSV**: Downloads a clean CSV with identical headers to the coach's sheet.
   - **Google Apps Script Webhook**: Syncs newly logged sessions directly to the coach's live Google Sheet in the background.

---

## 📲 How to Deploy as a Telegram Mini App (5 Minutes)

### Step 1: Host the Mini App (Free)
Host this folder (`index.html`, `styles.css`, `app.js`, `icon.jpg`) on any free static host:
- **Vercel**: Run `vercel` or connect GitHub repo.
- **GitHub Pages**: Push repo and enable Pages in repository settings.
- **Cloudflare Pages**: Drag and drop folder.

*(Your deployed URL will look like: `https://coachtrack-et.vercel.app`)*

### Step 2: Register on Telegram via @BotFather
1. Open Telegram and search for `@BotFather`.
2. Send `/newbot` to create your coach bot (e.g. `CoachDawitBot`).
3. Send `/newapp` to create the Mini App.
4. Select your bot.
5. Provide a title: **CoachTrack ET**.
6. Provide description: **Soccer timesheet & billing tracker**.
7. Upload `icon.jpg` as the app icon.
8. Paste your hosted URL (e.g., `https://coachtrack-et.vercel.app`).
9. Choose a short name (e.g., `tracker`).

🎉 **Done!** The coach can now open the bot and tap the **"Menu Button"** or link `t.me/CoachDawitBot/tracker` to launch the app inside Telegram.

---

## 📊 How to Connect Real-Time Google Sheets Sync

1. Open the coach's Google Sheet.
2. Click **Extensions > Apps Script**.
3. Copy and paste all the code from [`google_sheets_sync.gs`](google_sheets_sync.gs).
4. Click **Deploy > New deployment**:
   - Select type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the generated Web App URL.
6. Open **CoachTrack ET > Settings**, paste the URL into the **Google Apps Script Webhook URL** field, and tap **Save Preferences**.

Every practice finished or cancellation logged will now automatically append as a row in their spreadsheet!
