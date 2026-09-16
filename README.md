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

Create a Supabase project and copy its URL and secret key into `.env.local`.
No tables are required yet; the schema arrives with the first feature that needs it.

## Deployment

Deploy to Vercel and set the same three environment variables in the project settings.

## Adding shadcn/ui components

`components.json` is configured, so `npx shadcn@latest add <component>` drops new components into `src/components/ui`.
