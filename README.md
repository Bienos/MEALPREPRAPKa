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
   | `SUPABASE_URL`        | Supabase project URL (Project Settings → API).                          |
   | `SUPABASE_SECRET_KEY` | Server-only Supabase key (`sb_secret_...` or legacy `service_role`).    |
   | `GOOGLE_SHEETS_SPREADSHEET_ID` | Spreadsheet that holds the meal library.                       |
   | `GOOGLE_SHEETS_TARGET_GID` | The gid of the meal-library tab (default `965578947`).              |
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account that reads the sheet.                          |
   | `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Its private key, one line with `\n` sequences.           |

   The `GOOGLE_*` variables are optional in development: without them the Meals screen shows a
   small built-in fixture dataset. In production they are required for the meal library.

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

Google Sheets is the source of truth for meals. The app reads one tab, resolved from its gid at
runtime, so renaming the tab is safe. Columns are matched by header name (`Typ`, `Danie`, `Wersja`,
`Składniki i gramatura`, `Kcal`, `B (g)`, `T (g)`, `W (g)`, `Czas`, `Batch`, `Lodówka`, `Mrożenie`),
so column order does not matter.

One-time setup:

1. In Google Cloud Console create a project (or reuse one) and enable the **Google Sheets API**.
2. Create a **service account** and download a JSON key for it.
3. Open the spreadsheet, click **Share**, and add the service account's `client_email` as **Viewer**.
4. Put `client_email` in `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `private_key` in
   `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (one line, keep the `\n` sequences, quotes are fine).

The library is cached server-side for an hour. **Synchronizuj** on the Meals screen re-reads the
sheet immediately. If Google is unreachable the app keeps showing the last successful copy.

## Deployment

Deploy to Vercel and set the same three environment variables in the project settings.

## Adding shadcn/ui components

`components.json` is configured, so `npx shadcn@latest add <component>` drops new components into `src/components/ui`.
