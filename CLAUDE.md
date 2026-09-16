# MealPrep — CLAUDE.md

Private diet web app for ONE user. Goal: reduce daily diet decision fatigue.
Read this file before any change. Keep it concise; it holds the permanent rules.

## What this is (and is not)

- One user, one password. NOT SaaS.
- No multi-tenancy, subscriptions, social/community, growth features, public recipe discovery, or unnecessary infrastructure.
- Core loop: **PLAN → PREP → EAT → TAP → DONE**.
- The most common action must be ONE tap: planned meal → eat → tap **ZJEDZONE** → done.
- Manual food entry is the exception, never the default.

## Product principles

ONE TAP > FORM · REUSE > RE-ENTER · DEFAULTS > DECISIONS · 3 RECOMMENDATIONS > 100 RESULTS ·
PRE-LOG > POST-LOG · MEAL > INDIVIDUAL INGREDIENTS · BATCH > SINGLE PORTION · TODAY > ANALYTICS · ACTION > DATA.
90% accuracy used every day beats 100% accuracy with friction.

## Macro targets

| Day type            | kcal | protein | fat  | carbs |
| ------------------- | ---- | ------- | ---- | ----- |
| DT (training day)   | 2460 | 200 g   | 60 g | 280 g |
| DNT (non-training)  | 2360 | 220 g   | 80 g | 190 g |

## Data ownership

- **Google Sheets is the SOURCE OF TRUTH for the meal library** (meal type, name, DT/DNT variant, ingredients + quantities, kcal/macros, prep time, batch size, fridge life, freezable).
  Sheet: https://docs.google.com/spreadsheets/d/10-ncMSZQxVM7n93-F2cPl2vQWz0atXexrzKieQAE1sI/edit?gid=587242956#gid=587242956
- Never create another manually maintained meal database. Never duplicate editable meal definitions into Supabase.
- **Supabase stores only operational state**: settings, DT/DNT targets, default day templates, day plans, planned meals, eaten state, prep batches, fridge/freezer portions, shopping state, weight history.
- Historical planned/eaten meals MAY store macro snapshots so past days do not change when the sheet changes.

## Tech stack (deliberately simple)

Next.js (latest stable, App Router) · TypeScript · Tailwind CSS · shadcn/ui where useful · Lucide icons ·
Supabase Postgres · Google Sheets API · Zod · Vercel.

Do NOT use: Docker, VPS, SQLite, Redis, Kubernetes, microservices, Redux (unless clearly necessary), complex backend architecture.
Prefer simple server-side functions and a small, clean data-access layer.

## Auth

- Single password from `APP_PASSWORD`. Secure httpOnly session cookie, checked in `src/proxy.ts`.
- No registration, account management, password reset, OAuth, or user table.

## Information architecture

- Main navigation: exactly 3 tabs — **TODAY / PREP / MEALS**. Do not add more unless clearly necessary.
- Secondary screens (later): Fridge, Shopping, Progress, Settings.
- TODAY is the most important screen; the NEXT MEAL card visually dominates; primary CTA is **ZJEDZONE**.
- MEALS shows the sheet library as friendly mobile cards, never a spreadsheet-like UI.

## Design

- Mobile first, ~390 × 844 px. Primary UI language: Polish.
- Friendly, modern, warm, calm, minimal, food-oriented, premium but informal.
- Warm neutral background, dark readable text, small food-inspired accent palette, large rounded cards, large touch targets, generous spacing, subtle borders/shadows, Lucide icons, lightweight SVG/CSS graphics.
- Avoid: clinical healthcare styling, corporate dashboards, bodybuilding aesthetics, dense tables, excessive charts, gamification, stock photos.

## AI

Optional and secondary. Never required for the core app. No chatbot as the main interface. Interface stays card/button based.

## Engineering rules

- Simple readable code, small reusable components, clear server/client boundaries, minimal dependencies, no speculative abstractions.
- Before adding an abstraction, ask whether the current scope needs it.
- Do not refactor unrelated working code.
- Server secrets (`src/lib/env.ts`, `src/lib/supabase/server.ts`) are `server-only`; never import them from client components. There is no browser Supabase client by design.
- Before each task: `npm run lint && npm run typecheck && npm run build` must pass.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
