# ⚡ BetBuddy

A desktop-first (mobile-responsive) dark fintech web app for tracking friendly wagers — beers, dinners, coffee — with friends. No money, no gambling, just bragging rights.

## ✨ Features

- **Profile & Authentication** — Sign-up screen with image upload (canvas-resized to 200×200), emoji avatar picker, and profile dropdown (Edit / Switch User)
- **Multi-Friend Wagers** — Select one or more friends per bet via a custom checkbox picker
- **Custom Stakes** — Free-text stake field ("Dinner at Taizu", "50 ILS", "A week of coffee")
- **Precise Deadlines** — Date + time picker stored as ISO strings, displayed in locale format
- **Status Flow** — Pending → Won/Lost → Awaiting Payment → Settled, with confetti on "I Won"
- **WhatsApp Reminders** — Pre-filled message template opened in a new tab for awaiting-payment bets
- **Browser Notifications** — Native desktop alerts on bet settlement (permission auto-requested on load)
- **Live Leaderboard** — Friends ranked by win rate, derived dynamically from wager history
- **Persistent Storage** — All data (wagers, friends, profile) saved to `localStorage`
- **Mobile Drawer** — Hamburger-triggered slide-in sidebar on small screens
- **Dark Fintech UI** — Deep slate palette, emerald/orange/rose accent system, orange pulse glow on action-required cards

## 🛠 Tech Stack

| Layer | Tool |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite`) |
| Icons | Lucide React |
| Confetti | `canvas-confetti` |
| Storage | Browser `localStorage` |
| Notifications | Web Notifications API |
| Deploy | Vercel (static) |

## 🚀 Local Setup

```bash
git clone https://github.com/YOUR_USERNAME/betbuddy.git
cd betbuddy
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## 📦 Build for Production

```bash
npm run build
# Output in dist/
```

## ☁️ Deploy to Vercel

1. Push this repo to GitHub (see below)
2. Go to [vercel.com](https://vercel.com) → **Add New Project**
3. Import your GitHub repo
4. Leave all settings as defaults (Vercel auto-detects Vite)
5. Click **Deploy** — done in ~30 seconds

Your app gets a free `*.vercel.app` URL instantly.

## 🗂 Project Structure

```
src/
├── avatars.ts          # Shared avatar config (emoji + colors)
├── notifications.ts    # Browser Notification API helpers
├── types.ts            # TypeScript interfaces (Wager, Friend, UserProfile)
├── mockData.ts         # Empty — app starts fresh
├── App.tsx             # Root: routing, state, profile menu, mobile drawer
├── index.css           # Tailwind import + custom keyframes
└── components/
    ├── Welcome.tsx     # Sign-up / Edit Profile screen (with image upload)
    ├── Sidebar.tsx     # Summary, New Wager form, Friends leaderboard, Alerts toggle
    └── WagerCard.tsx   # Individual bet card with status flow + WhatsApp button
```

## 🔐 Privacy

All data is stored exclusively in your browser's `localStorage`. Nothing is sent to any server. Profile pictures are compressed to ≤ ~60 KB JPEG before storage.
