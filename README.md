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

## Deployment

Deploy to Vercel and set the same three environment variables in the project settings.

## Adding shadcn/ui components

`components.json` is configured, so `npx shadcn@latest add <component>` drops new components into `src/components/ui`.
