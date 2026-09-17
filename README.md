# MealPrep

Private, single-user diet app. Plan → prep → eat → tap **ZJEDZONE** → done.

Product and engineering rules live in [CLAUDE.md](./CLAUDE.md).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui-style components · Lucide · Supabase Postgres · Zod · Vercel.

## Local setup

1. Install Node.js 20+ and run:

   ```bash
   npm install
   ```

2. Create `.env.local` from the example and fill it in:

   ```bash
   cp .env.example .env.local
   ```

   | Variable              | Purpose                                                                  |
   | --------------------- | ------------------------------------------------------------------------ |
   | `APP_PASSWORD`        | Password for the single-user gate (min. 8 characters).                  |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (Project Settings → API).                      |
   | `SESSION_SECRET`      | Signs the session cookie. Optional; falls back to `APP_PASSWORD`.       |
   | `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase key (`service_role` or `sb_secret_...`).     |
   | `GOOGLE_SHEETS_SPREADSHEET_ID` | Spreadsheet that holds the meal library.                       |
   | `GOOGLE_SHEETS_TARGET_GID` | The gid of the meal-library tab (default `965578947`).              |
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Optional: service account for a private (not link-shared) sheet. |
   | `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Optional: its private key, one line with `\n` sequences.  |

   `GOOGLE_SHEETS_SPREADSHEET_ID` is optional in development: without it the Meals screen shows
   a small built-in fixture dataset. In production it is required for the meal library. The
   `GOOGLE_SERVICE_ACCOUNT_*` variables are always optional — see below.

3. Start the dev server:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000, enter `APP_PASSWORD`, and you land on **Dziś**.

## Scripts

| Command             | What it does              |
| ------------------- | ------------------------- |
| `npm run dev`       | Development server        |
| `npm run lint`      | ESLint                    |
| `npm run typecheck` | `tsc --noEmit`            |
| `npm test`          | Unit tests (node:test)    |
| `npm run build`     | Production build          |
| `npm start`         | Serve the production build|

## Supabase

1. Create a Supabase project and copy its URL and secret key into `.env.local`.
2. Apply the schema in `supabase/migrations/` (in order). Either paste each file into the
   SQL Editor in the Supabase dashboard, or use the CLI:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

The first migration creates the operational tables (settings, DT/DNT targets, day plans,
planned meals, prep batches, portions, shopping items, weight logs) and seeds the default
targets. Meal definitions are never stored in Supabase; Google Sheets owns them.

All database access goes through `src/lib/db/*` (server-only). UI code never calls Supabase directly.

## Google Sheets (meal library)

Google Sheets is the source of truth for meals. Columns are matched by header name (`Typ`, `Danie`,
`Wersja`, `Składniki i gramatura`, `Kcal`, `B (g)`, `T (g)`, `W (g)`, `Czas`, `Batch`, `Lodówka`,
`Mrożenie`), so column order does not matter.

There are two ways to connect it, in order of preference:

**Default: a link-shared spreadsheet, no Google Cloud project needed.**

1. Open the spreadsheet, click **Share**, and set general access to **Anyone with the link — Viewer**.
2. Set `GOOGLE_SHEETS_SPREADSHEET_ID` and `GOOGLE_SHEETS_TARGET_GID`. That's the whole setup.

The app reads the tab via Google's public CSV export for that gid. This needs no Google Cloud
project, no service account, and no billing account — it's a plain HTTP GET. The tradeoff: anyone
who has the exact link can view the sheet (it is not searchable or indexed, but it is not
access-controlled either). In this mode the app cannot resolve the tab's display name from its gid
alone, so the Meals screen just doesn't show one; the data itself is unaffected.

**Alternative: a service account, for a spreadsheet that must stay private.**

1. In Google Cloud Console, enable the **Google Sheets API** for a project.
2. Create a **service account** and download a JSON key for it. Some Google accounts have an
   organization policy (`iam.disableServiceAccountKeyCreation`) that blocks this step entirely —
   if so, use the link-shared method above instead.
3. Open the spreadsheet, click **Share**, and add the service account's `client_email` as **Viewer**.
4. Set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (one line, keep the
   `\n` sequences, quotes are fine) alongside the two variables above.

When both service-account variables are set, the app uses the authenticated Sheets API instead of
the public export, and can also resolve the tab's real name from its gid.

The library is cached server-side for an hour. **Synchronizuj** on the Meals screen re-reads the
sheet immediately. If Google is unreachable the app keeps showing the last successful copy.

## Deployment

See **[DEPLOY.md](./DEPLOY.md)** for the full walkthrough: Supabase, Google Sheets,
GitHub and Vercel, plus installing it on an iPhone. After the first setup,
shipping a change is just `git push`.

Health check: `GET /api/health` returns `{"status":"ok"}` and is the only public route.

## Adding shadcn/ui components

`components.json` is configured, so `npx shadcn@latest add <component>` drops new components into `src/components/ui`.
