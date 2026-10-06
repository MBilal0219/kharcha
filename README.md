# Kharcha

A budget tracker that tells you how much you can safely spend **today**. You choose how your money comes in (weekly, every two weeks or monthly), which days you have off, and what to keep aside. It tracks loans, nudges you in the evening if you forgot to log, and helps you save. Works offline, in any currency.

## What it does

- **Safe to spend today.** The period's money (your budget + other money in + carry-over) minus what is set aside, split over the working days left. It recalculates after every entry.
- **Your own schedule.** Budget weekly, every 2 weeks or monthly, starting on the day you pick. Choose your days off; a 5-day week and a 6-day week give different daily figures. A change applies from a date you choose and never rewrites earlier days. Single dates can be marked off or working.
- **Set aside.** Money kept out of the daily budget until it is paid or saved: something to pay (the fare home, rent, a gift this weekend) or an amount to save each period. Each one repeats every period or applies to this period only.
- **Fast logging.** Tap a category on the home screen, type the amount, save. One-tap buttons for things you buy often at the same price.
- **Money in.** Your budget plus any other income (salary, freelance, gifts), by category. Extra income prompts you to save part of it.
- **Loans.** Borrow, lend, pay back, collect. People are saved by name (no duplicates) and picked from a list. Due dates, overdue warnings, a "debt-free in N weeks" estimate, and "borrow from my own savings".
- **Savings.** An emergency buffer you fill first, then goals with target dates. Prompts to save extra income and the period's leftover.
- **Cash check.** You count the cash in your pocket and the app shows the gap against your ledger, so untracked spending can't hide.
- **History.** Search and filter every entry; tap one to edit or delete it.
- **Reports.**
  - By budget period or calendar month: daily spending against your limit, where the money went and where it came from, needs vs wants
  - Money in vs spending by week, savings growth, biggest expenses, and plain-language insights
  - CSV export
- **Reminders.**
  - A push notification in your evening (your own time zone), but only if nothing is logged today
  - Loan-due alerts and a summary on the last day of your budget period
  - An in-app banner as backup
- **Offline-first.** Everything is saved on the phone first (IndexedDB) and synced to MongoDB when you're online. Android can sync in the background after you close the app.
- **Wallets, need/want tags, one-off flag, category limits, logging streak, light and dark mode.**

Shared groups with expense splitting are planned but not built yet.

## Try it in 1 minute (no setup)

```bash
npm install
npm run demo
```

Open http://localhost:3000. Demo mode skips sign-in and fills the app with three weeks of sample data. Nothing is sent to a server.

## Stack

| Part | Choice |
|---|---|
| App | Next.js 15 (App Router), TypeScript, Tailwind CSS 4 |
| Phone database | Dexie (IndexedDB), the source of truth for the UI |
| Server database | MongoDB Atlas (free M0) via the native driver |
| Auth | Auth.js v5: email + password or Google, JWT sessions (90 days) |
| Email | SMTP via `nodemailer` for confirmation and password-reset links |
| PWA / offline | Serwist service worker; all screens precached |
| Push | Web Push (VAPID) via `web-push` |
| Charts | Recharts |
| Scheduler | cron-job.org (free), hourly, calling `/api/cron/reminder` |
| Tests | Vitest for all budget math |

## Deploy for free: step by step

### 1. MongoDB Atlas
1. Create a free account at mongodb.com/atlas and create an **M0** cluster.
2. In **Database Access**, add a user with a long random password.
3. In **Network Access**, allow `0.0.0.0/0`. Vercel has no fixed IPs, so the password is what protects the cluster.
4. Go to **Connect → Drivers** and copy the connection string. That's your `MONGODB_URI`.

### 2. Google sign-in (optional)
Email and password sign-in works without this. The "Continue with Google" button appears only when both keys below are set.

1. Go to console.cloud.google.com, then **APIs & Services → Credentials → Create OAuth client ID** (type: Web application).
2. Add these authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://YOUR-APP.vercel.app/api/auth/callback/google`
3. Copy the client ID and secret into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` in `.env.local` (and in Vercel), then restart the server.
4. On the **OAuth consent screen**, add your email as a test user. To let anyone sign in, publish the app there; Google asks for the privacy policy link (`/privacy`).

### 3. Secrets
```bash
cp .env.local.example .env.local
npx auth secret          # writes AUTH_SECRET
npm run vapid            # prints VAPID public/private keys
```
Fill in `.env.local`. For `CRON_SECRET`, use any long random string.

For email sign-up and password reset, set the `SMTP_*` variables. With Gmail, turn on 2-Step Verification, create an app password (Google Account → Security → App passwords) and use it as `SMTP_PASS`. Without `SMTP_HOST`, `npm run dev` prints each email (with its link) to the server console, so you can still test the flow locally. In production, email sign-up and reset fail until SMTP is set; Google sign-in works without it.

### 4. Run locally
```bash
npm run dev
```
Push notifications and offline mode only work in a production build. To test them, run `npm run build && npm start`.

### 5. Vercel
1. Push the repo to GitHub, then import it at vercel.com (Hobby plan, free).
2. Add every variable from `.env.local` in **Settings → Environment Variables**.
3. Deploy, then add the production URL's callback to Google (step 2).

### 6. Reminders (cron-job.org)
Create one free job that runs **every hour**:

| URL | Schedule | Header |
|---|---|---|
| `https://YOUR-APP.vercel.app/api/cron/reminder` | Every hour, at minute 0 | `Authorization: Bearer <CRON_SECRET>` |

Each user is reminded once their own clock reaches their reminder hour, so one job covers every time zone.

### 7. GitHub Actions (backups and keep-alive)
- Add the repo secrets `MONGODB_URI` and `BACKUP_PASSPHRASE` (a long random string) to enable the weekly encrypted `mongodump` backup (`.github/workflows/backup.yml`). Keep a copy of the passphrase: a backup can't be restored without it.
- Add the repo variable `APP_URL` to enable the keep-alive ping (`keepalive.yml`).

### 8. Install on your phone
Open the site in **Chrome on Android**, then use **⋮ → Add to Home screen / Install app**. Open it from the home screen, sign in, and go to **Settings → Reminders** to turn on notifications.

On iPhone, use Safari → Share → Add to Home Screen, then turn on reminders from inside the installed app.

## How offline sync works

1. Every write goes to IndexedDB first, with `dirty = 1`. The UI updates instantly.
2. `syncNow()` sends dirty rows to `POST /api/sync`. It runs when the app opens, when the phone comes back online, every 2 minutes, and through Background Sync.
3. The server validates each row with zod and upserts it on `{ _id, userId }`. When the same row was changed in two places, the newer `updatedAt` wins. Each saved row is stamped with `syncedAt` in server time.
4. The server returns everything changed since the phone's cursor. The phone clears the dirty flags and applies those changes.
5. Deletes are tombstones (`deletedAt`), so they sync like any other change.
6. If the evening push arrives while today's entries are still unsynced, the service worker reads IndexedDB and shows "entries waiting to sync" instead of a false reminder.

## Project map

```
app/
  (app)/            static client screens (precached, work offline)
    page.tsx        Home: safe-today ticket, quick add, prompts, week strip, limits
    add/            Add / edit entry (expense, income, loan, save, move)
    history/        Search + filters, grouped by day
    reports/        Week / month analytics + CSV
    money/          Savings, loans, wallets, cash count
    settings/       Budget, schedule, set aside, categories, one-tap buttons, wallets, reminders, backup
  api/              sync, me, push, cron, health, auth
  login/ signup/ forgot/ reset/ verify/   signed-out screens
  offline/  sw.ts  manifest.ts  actions.ts
lib/
  budget/           PURE math: period.ts, week.ts, calc.ts, insights.ts, report.ts (tested)
  local/            Dexie db, ops (all writes), sync engine, app data provider, demo
  server/           sync handler + seeding, push sender, reminders, accounts, mail, rate limit
  db/               Mongo client + zod schemas for sync
  auth/             Auth.js config, requireUserId()
components/         UI kit, ticket hero pieces, charts, add screen, cash count
tests/              vitest
```

## Scripts

| Command | What it does |
|---|---|
| `npm run demo` | Try the app with sample data, no setup |
| `npm run dev` | Development server |
| `npm test` | Budget math tests |
| `npm run lint` | Type check |
| `npm run build` | Production build (also builds the service worker) |
| `npm run vapid` | Generate push keys |

## Troubleshooting

- **"Sign in to sync" pill.** Your session expired. Sign in again; entries saved offline are kept and sync afterwards.
- **No evening notification.**
  - Check that Settings → Reminders is on, and use **Send a test**.
  - Check the cron-job.org job history: it should return 200.
  - A 401 there means the `CRON_SECRET` doesn't match.
- **App doesn't open offline.** Open it once online after installing, so the service worker can cache all the screens.
