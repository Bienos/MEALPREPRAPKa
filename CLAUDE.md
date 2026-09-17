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
  Sheet: https://docs.google.com/spreadsheets/d/10-ncMSZQxVM7n93-F2cPl2vQWz0atXexrzKieQAE1sI/edit?gid=894227705#gid=894227705 (tab gid `894227705`)
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

- Main navigation: 4 tabs — **TODAY / PREP / MEALS / HISTORY**. Do not add more unless clearly necessary. History was added on the owner's explicit request after it proved unfindable as a link on Today.
- Secondary screens (later): Fridge, Shopping, Settings.
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
- Schema lives in `supabase/migrations/` (one file per change, never edit an applied file). All queries live in `src/lib/db/*`; UI and server actions call those functions, never Supabase directly.
- Rows are validated with Zod at the data-access boundary; there are no generated Supabase types.
- Meal library: `src/lib/google-sheets/` reads the sheet server-only, either via the public CSV export (default, needs only `GOOGLE_SHEETS_SPREADSHEET_ID`/`GID`, sheet shared as link-viewable) or the authenticated Sheets API when a service account is configured. `src/lib/meals/` parses rows by normalized header names, groups DT/DNT rows into one meal, caches, and falls back to the last good copy. Ingredients stay raw text. Fixtures in `src/lib/meals/fixtures.ts` are development-only.
- UI never calls Google Sheets directly; pages call `getMealLibrary()`.
- Today: `src/app/(app)/page.tsx` fetches day state server-side and hands it to `today-view.tsx` (client), which keeps optimistic state so ZJEDZONE is instant; the server write follows. `planned_meals.status` is one of planned/eaten/skipped/swapped/adhoc. `default_day_meals` holds the DT/DNT templates as meal_key/variant references only. Portion changes rescale the stored macro snapshot and never touch the sheet.
- Prep: `src/lib/meals/prep-plan.ts` generates the plan deterministically (no AI, no solver); `ingredients.ts` is the only place that reads ingredient text; `cooking-steps.ts` turns a plan into kitchen steps. A prep targets one slot (`sniadanie`/`obiad`/`kolacja`, stored on `prep_sessions.slot`), matched against the sheet's own category column, so widening a slot means adding rows to the sheet. The generated plan is a starting point, not the only path: `availableDishes()` backs browsing the whole slot and picking dishes by hand. `src/lib/meals/prep.ts` orchestrates session, shopping list and finishing. `prep_sessions`/`prep_session_items` hold the in-progress prep; finishing writes `prep_batches` + `portions`. Marking a meal eaten on Today consumes the earliest-expiring matching portion automatically.
- Exceptions: all ranking lives in `src/lib/meals/recommend.ts` (swaps and no-cook); `rebalance.ts` holds the day projection, correction blocks and dinner-out maths, all deterministic arithmetic, never AI. `exceptions.ts` orchestrates them. Ad-hoc food is stored in `planned_meals` with status `adhoc`, a `source` of saved_meal/quick_add/ai_estimate/manual, and `approximate` when the macros are estimated.
- AI is optional and isolated to `src/lib/meals/ai-estimate.ts` (Anthropic SDK, structured output). Without `ANTHROPIC_API_KEY` the option hides and everything else works.
- Deployment: GitHub → Vercel → Supabase → Google Sheets, documented in `DEPLOY.md`. No Docker, no VPS, no local filesystem writes. All configuration is read in `src/lib/env.ts` and nowhere else; only `NEXT_PUBLIC_*` may reach the browser. `GET /api/health` is the one public route.
- Before each task: `npm run lint && npm run typecheck && npm run build` must pass.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
