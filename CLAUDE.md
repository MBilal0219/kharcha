# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Kharcha is an offline-first budget tracker PWA for anyone, in any currency: it shows what is safe to spend today. Shared groups (Splitwise-style) are planned, not built. Next.js 15 App Router, TypeScript strict, Tailwind CSS 4, Dexie (IndexedDB), MongoDB via the native driver (no Mongoose), Auth.js v5 (email + password and Google, JWT), Serwist, web-push, Recharts, zod 4, date-fns-tz, Vitest.

## Commands

```bash
npm run demo     # dev server with NEXT_PUBLIC_DEMO=1: no sign-in, no server, 3 weeks of sample data in IndexedDB
npm run dev      # dev server (needs .env.local: Mongo, Google OAuth, AUTH_SECRET — see .env.local.example)
npm run lint     # tsc --noEmit (there is no ESLint)
npm test         # vitest run (tests/**/*.test.ts)
npm run build    # production build; also compiles app/sw.ts to public/sw.js
npm run vapid    # generate web-push keys
```

- Single test: `npx vitest run tests/budget.test.ts -t "summarizeWeek"` (watch mode: `npx vitest`).
- The service worker is disabled in development. Offline mode, Background Sync and push only work under `npm run build && npm start`.
- Before finishing a change, run what CI runs: `npm run lint && npm test && npm run build`. The build works without env vars because the Mongo client is lazy (`lib/db/client.ts`); keep it that way.
- No new dependencies without asking.

## Architecture

### Data flow: the phone's database is the source of truth

Screens under `app/(app)` are `"use client"` static shells. No server component fetches user data. Because they are static, all of them are precached by the service worker (the route list in `next.config.ts` → `appRoutes`; add new screens there).

- **Read path:** `components/app-shell.tsx` resolves sign-in state (`/api/me`, cached in the Dexie `meta` table so the app opens offline), then mounts `AppDataProvider` (`lib/local/app-data.tsx`). The provider runs one `useLiveQuery` over every Dexie table, filters tombstones, and derives all budget numbers by calling `lib/budget/*`. Screens read everything through `useAppData()`.
- **Write path:** every write goes through `lib/local/ops.ts` (`save` / `patch` / `remove` / `addTx` / …). These stamp `updatedAt`, set `dirty = 1`, and call `requestSync()`. Never write to Dexie tables directly from components.
- **Sync:** `lib/local/sync.ts` `syncNow()` posts dirty rows plus a `since` cursor to `POST /api/sync`, the only server data endpoint. `lib/server/sync.ts` zod-validates each row, upserts on `{ _id, userId }` with last-write-wins on `updatedAt`, stamps `syncedAt` in server time, and returns rows with `syncedAt > since`. The client clears `dirty` only if the row was not edited again mid-flight. First sync for an account seeds starter wallets/categories/goals (`lib/seed.ts`); the app shows "Setting up your ledger" until a settings row arrives, then the setup screen (`components/onboarding.tsx`) until `settings.onboarded`.
- **Service worker** (`app/sw.ts`) imports `lib/local/db` and `lib/local/sync` directly, so those modules must stay free of `window`/React. It runs `syncNow()` on Background Sync and rewrites the evening push if today's entries exist locally but are unsynced.
- **Demo mode** (`lib/local/demo.ts`) seeds Dexie and sets a `demo` meta flag that makes `syncNow()` a no-op.

### Record shapes and IDs

- `lib/types.ts` holds the shared shapes. Every synced record has `id`, `updatedAt`, `deletedAt`; the phone adds `dirty`, the server adds `userId` + `syncedAt`.
- IDs are `crypto.randomUUID()` strings used as Mongo `_id`. Per-user singletons use derived ids: `settings:${userId}`, and `${userId}:${day|periodStart}` for `dayClosures` / `dayOverrides` / `periodSettings`. The server rejects derived ids that don't match the session user.
- Deletes are tombstones (`deletedAt`). Never hard-delete synced records; filter `deletedAt` everywhere.
- **Adding a field:** update `lib/types.ts` and `lib/db/schemas.ts` (zod strips unknown fields, so it silently won't sync otherwise), plus the Dexie index if it is queried.
- **Adding a table:** add it to `SYNC_TABLES`, the Dexie schema in `lib/local/db.ts` (bump the version), and `lib/db/schemas.ts`.

### Budget math

- Lives only in `lib/budget/*.ts` as pure functions that take `today` / `now` as parameters. Never call `new Date()` inside `lib/budget`. Components never compute budget numbers themselves.
- `lib/budget/period.ts` decides periods and working days from the `schedules` table. A schedule row applies from its `from` day until the next row; a change is a new row, never an edit, so earlier days keep the schedule they had. A layout change (weekly/biweekly/monthly or start day) ends the old period the day before; changing only the days off does not.
- Nothing stores which period an entry belongs to. Transactions store `day` (the user's timezone, computed in `lib/local/ops.ts` at write time) and periods are found by date range.
- `summarizePeriod` (`calc.ts`): daily limit = money still free ÷ working days left.
- `week.ts` holds plain date helpers. `weekStartOf` is the calendar Monday, used for charts only.
- Any change to `lib/budget` needs a Vitest test in `tests/`.

### Domain rules

- Money is an integer number of hundredths in every currency. Never floats. Format with `money()` / `num()`, parse typed input with `parseAmount()`, fill inputs with `toInput()` (`lib/money.ts`). Use `components/amount-input.tsx` for money fields; there is no on-screen keypad by the user's choice.
- The currency (`settings.currency`) only sets the symbol and decimals. Changing it relabels amounts, it does not convert them. Server code passes the currency code to `money()` explicitly; on the client the app data provider sets it once.
- The budget is what the user logs as income in the `budget` category each period (`settings.budgetAmount` only prefills it). Other income adds to the period's money.
- Set-aside amounts (`reserves` table): `kind: "spend"` is something to pay, `kind: "save"` is a saving target. Each is held out of spendable until an expense (or, for a target, a saving) carries its `reserveId`, or it is released for the period in `periodSettings.reservesOff`. `amounts` is a history, so an amount change applies from now on; `until` ends one, and equals the period's last day for a this-period-only item.
- Savings goals are virtual jars: `saving` / `saving_withdraw` never change wallet balances.
- Loans live in the `loans` table; repayments are transactions with `loanId`. Borrowing from your own savings is a loan with `personId: null` plus a `saving_withdraw`; repaying it is a `saving` with `loanId`. People are unique by name per account (`addPerson`).
- The only categories logic depends on are identified by `key`: `budget`, `found`, `unaccounted`. Never match a category by name, and don't hardcode anything about one user's routine (fare, allowance, a weekday).

### Server

- `userId` comes only from `requireUserId()` (`lib/auth/require-user.ts`). Never trust a userId from client input. Every Mongo query and update includes `{ userId }`.
- Never call `auth()` directly to decide who is signed in; use `currentUser()` / `requireUserId()`. Sessions are JWTs, so these also check the `users` row on every request: a deleted account or a sign-in older than `sessionsValidFrom` (set by a password reset) is rejected.
- The `accounts`, `users`, `sessions` collections belong to Auth.js. `lib/server/accounts.ts` adds `credentials` (password hash keyed by userId) and `authTokens` (hashed, expiring email links), and writes `users` rows for email sign-ups.
- A password account is created only when the emailed link is opened (`completeSignup`), so every user's email is proven. Google's `allowDangerousEmailAccountLinking` depends on that; never create a `users` row for an unconfirmed email.
- Links in emails are built from `appUrl()` (`lib/server/mail.ts`), never from request headers.
- Abuse limits: `rateLimit()` (`lib/server/rate-limit.ts`, Mongo fixed window) guards login, sign-up, reset and `/api/sync`; sync also caps rows per user per table (`MAX_ROWS_PER_USER`).
- `next.config.ts` sets a Content-Security-Policy that allows only this origin (plus `accounts.google.com` as a form target). Loading anything from another origin (script, font, image, API call) needs a matching change there.
- `/privacy` lists what is stored and which services process it; update it when that changes.
- "Start over" (`POST /api/me/reset`) deletes a user's data but keeps the account and raises `users.dataEpoch`. Every sync sends the phone's epoch; on a mismatch the server answers `{ reset: true }` and the phone drops its copy and pulls again. Wipe a user's data only through `resetUserData`, or other devices push the old rows back.
- Account deletion (`DELETE /api/me`) hard-deletes every collection keyed by the user. A new per-user collection must be added to `deleteAccount`.
- `/api/cron/reminder` is called hourly by cron-job.org; each user is handled once their local hour reaches `settings.reminderHour`. Cron routes verify `CRON_SECRET` and claim a `reminderLog` row (unique index on `userId, day, kind`) before sending a push, so retries don't double-send.

## UI conventions

- Mobile-first: design at 375–390px. Minimum touch target 44px.
- Colors only from the CSS tokens in `app/globals.css` (`bg`, `surface`, `ink`, `accent`, `gold`, `danger`, `ticket-*`, `series-*`). Light and dark themes must both work.
- `font-display` (Bricolage Grotesque) for headings and big numbers, `font-sans` (Figtree) for body, `tnum` for aligned numbers.
- Bottom sheets are `Sheet` from `components/ui.tsx`: it slides in and out and closes by dragging down. Don't build another modal.
- Reuse `components/ui.tsx` (Button, Card, Sheet, Segmented, Chip, Field, Toggle, Progress, toast). No new UI library.
- Charts: thin marks, recessive grid, tooltips, colors from `--series-1..3`.
- Keep screens simple and easy to navigate (the user's standing request): few things per screen, setup in Settings.
- Copy: short, plain, active voice. Say what happened ("Saved to Emergency buffer"), no apologies.
- Split components past ~250 lines.
