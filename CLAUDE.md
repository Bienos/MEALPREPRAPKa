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
- The app edits the sheet only through `src/lib/meals/sheet-edit.ts` (pure plan of exact cells: rows found by name + variant in a fresh read, only known columns, only changed cells, never deletes) and `src/lib/google-sheets/write.ts` (RAW writes, service account with Editor access).
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

- Main navigation: 4 tabs — **TODAY / PREP / MEALS / CALENDAR**. Do not add more unless clearly necessary. The calendar replaced History on the owner's request: a month grid, and every day opens its own page (`/dzien/[date]`) with that day's meals, totals and what was cooked.
- Every day screen starts with a strip of seven days around it (`day-strip.tsx`, built by `buildDays` in `calendar.ts`): DT/DNT and a status dot per day, one tap to open it. That is how tomorrow is planned: open it, fill it from the default, edit, switch DT/DNT. Anything the owner can set up must be somewhere they can then see.
- Secondary screens (later): Fridge, Shopping, Settings.
- TODAY is the most important screen; the NEXT MEAL card visually dominates; primary CTA is **ZJEDZONE**.
- MEALS shows the sheet library as friendly mobile cards, never a spreadsheet-like UI.

## Design

- Mobile first, ~390 × 844 px. Primary UI language: Polish.
- Friendly, modern, warm, calm, minimal, food-oriented, premium but informal.
- Warm neutral background, dark readable text, small food-inspired accent palette, large rounded cards, large touch targets, generous spacing, subtle borders/shadows, Lucide icons, lightweight SVG/CSS graphics.
- Avoid: clinical healthcare styling, corporate dashboards, bodybuilding aesthetics, dense tables, excessive charts, gamification, stock photos.
- Meal pictures: one drawing per kind of dish in `public/food/`, picked from the meal name by `src/lib/meals/images.ts` (keyword rules, category fallback). No picture column in the sheet; new meals get a picture automatically.

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
- Prep: `src/lib/meals/prep-plan.ts` generates the plan deterministically (no AI, no solver); `ingredients.ts` is the only place that reads ingredient text; `cooking-steps.ts` turns a plan into kitchen steps. A prep targets one slot (`sniadanie`/`obiad`/`kolacja`, stored on `prep_sessions.slot`), matched against the sheet's own category column, so widening a slot means adding rows to the sheet. The generated plan is a starting point, not the only path: `availableDishes()` backs browsing the whole slot and picking dishes by hand. `src/lib/meals/prep.ts` orchestrates session, shopping list and finishing. `prep_sessions`/`prep_session_items` hold the in-progress prep; finishing writes `prep_batches` + `portions`. Marking a meal eaten on Today consumes the earliest-expiring matching portion automatically. When the prep's days already have that slot's dishes planned, the prep cooks those (`prepFromPlanned`) instead of suggesting others. A batch lasts a prep when its fridge life is at least days − 1 (or it freezes); the day picker offers only what each slot's dishes last (`maxPrepDays`), and breakfast/supper count one portion a day, meal prep two.
- Week (`/prep/tydzien`, the "Plan tygodnia" card on Prep) is built from ready days. `src/lib/meals/ready-days.ts` (pure, no AI) makes whole days from the sheet (breakfast + meal prep ×2, or meal prep + supper, plus at most two snacks) that hit the day's DT/DNT target (±3% kcal, ≥95% protein); `planWeek` fills empty days, cooking each main in a batch of up to three days that its fridge life and batch size allow. Tapping a day shows its proposals; "Ułóż" fills every empty day. There is no week table: every day is planned meals, so Today and the calendar show it. `week.ts` loads the week and applies a ready day (today or later, only over meals still planned); `week-plan.ts` keeps the week dates and what to buy. Under the days, "Zakupy na te dni" shows the same price card as Zakupy.
- The sheet's generic "warzywa" (also "warzywa / mieszanka") is expanded on the shopping list into `VEGETABLE_MIX` in `ingredients.ts` (pomidor, ogórek, cebula, papryka, pieczarki), the amount split evenly to 10 g, so each has a price at a shop; fresh-vegetable rules in `match.ts` keep tins, jars, sauces and powders out.
- Shopping list: one definition, rebuilt by `rebuildShoppingList()` in `prep.ts` whoever asks (the week, a prep, a staple running out, discarding a prep): every planned sheet meal not yet eaten from today up to two weeks ahead, minus fridge portions, plus the active prep's dishes when it suggested its own. Staples at home are left out, hand-added items stay, and ticks survive a rebuild (`keepTicks`).
- Today and every other day are the same screen: `today-view.tsx` takes `when` = today / past / future and `src/lib/meals/day-view.ts` loads it. Order: day strip, then the next meal with ZJEDZONE (today only, kept above the fold), then totals with the **Dodaj jedzenie** button, then the day list sorted by time of day (`sortDay`). Nothing floats over ZJEDZONE. tapping a row opens `meal-sheet.tsx` (portion, macros, eaten, swap, remove). Food goes in through the one **Dodaj** sheet (`add-sheet.tsx`): "Zjadłem" logs it eaten, "Dodaj do planu" puts it on the list (a future day only plans, a past day only logs); it also replaces a planned meal by searching the whole library. Switching DT/DNT also switches the planned, not-yet-eaten meals to their other version (`day-type.ts`); eaten and hand-logged food is never rewritten.
- Sheets (`components/ui/sheet.tsx`) report only a close the person made, never one caused by `open` going false, so one sheet can open another without the second being closed by the first's close event.
- Calendar: `src/lib/meals/calendar.ts` builds the month (Monday first, tone per finished day against that day's own target); `/historia` redirects to `/kalendarz`.
- Exceptions: all ranking lives in `src/lib/meals/recommend.ts` (swaps and no-cook); `rebalance.ts` holds the day projection, correction blocks and dinner-out maths, all deterministic arithmetic, never AI. `exceptions.ts` orchestrates them. Ad-hoc food is stored in `planned_meals` with status `adhoc`, a `source` of saved_meal/quick_add/ai_estimate/manual, and `approximate` when the macros are estimated.
- Prices ("Gdzie taniej?" on Zakupy and the week screen) live in `src/lib/prices/`. One tap on **Sprawdź promocje** (no cron, no headless browser, no new route) reads `lidl.ts` (the JSON lidl.pl's own pages load: the ~30 deals its site shows), `blix.ts` (every chain's leaflet, Lidl's included, through blix.pl's own JSON: a quick search, at most two pages, per item still to buy, with items no rule knows searched by their own words; and a **full sweep**, a call of its own after the first, that reads every page of every grocery category (~150 pages, ~25 s, 4 at a time, a 50 s budget) into `shop_promos` and is not repeated for 12 h, tracked in `source_refreshes`; offers are upserted and expired ones deleted, never replaced wholesale, and `loadPricing` sends the screen only the ones `relevantPromos` says could be an item on the list) and `biedronka.ts` (Biedronka's regular **shelf prices** from its online shop: the sitemap, then the product pages that `catalogCandidates` thinks are on the list, at most 45 per tap, kept in `shelf_prices` and re-read after two weeks; they count 30 days, marked "cena z półki (sklep online)", since the shop on the corner can differ a little); parsing is pure and tested on `fixtures/`. `stokrotka.ts` reads Stokrotka's regular prices from the Google Merchant product feed its online shop publishes and robots.txt allows (~20 000 products, one ~40 s request, so it is a second call after the first, kept for 12 h; the plainest few in-stock products per item go to `shelf_prices`). `frisco.ts` reads Frisco's public product feed (listed in its robots.txt: ~15 000 products, ~57 MB JSON, a few seconds, same second call as Stokrotka, kept 12 h): the plainest few in-stock products per item go to `shelf_prices` as a reference price from an online grocer; cartons (`packSize` > 1) are skipped, and products sold by weight (a range like "(800g-1200g)" in the name) are priced loose at the average weight the feed gives (its price is for that weight, not a kilo). `auchan.ts` reads Auchan's online shop (zakupy.auchan.pl) by **category pages** (the sitemap its robots.txt lists; each page embeds its first 50 products with price now, price per kilo/litre/piece and stock), and `biedronka.ts` does the same with Biedronka's category pages (32 product tiles each) next to its product pages: `categoriesFor` picks, per item on the list, the few shelves whose path names it (the narrowest shelf first), at most 40 (Auchan) / 60 (Biedronka) per tap in the same second call, remembered in `source_refreshes` (`cat:{shop}:{url}`) so the next tap takes the next shelves; every product on them is priced and `catalogCandidates` keeps the plainest ten per item. Auchan's protection answers `202` with an empty page when requests come too fast: that is its limit, so the read is two at a time, stops at the first such answer, keeps what it read and tells the person to try again in a few minutes; never work around it. `lidl-everyday.ts` holds Lidl's **everyday prices** (same in every Lidl; it has no online food catalogue): the pages of its leaflet "Rewolucja cenowa! Każdego dnia tanio" read off the images by hand on 20.10.2026 (the leaflet's text is a scrambled bag of words, so it cannot be parsed), valid to the leaflet's end (31.12.2026) and added in `loadPricing` as shelf prices; when it ends, read the next one. **Promocje tygodnia** (`/prep/promocje`, linked from Zakupy; `deals.ts` is the pure filter/sort) lists every shop's leaflet and app deals stored in `shop_promos`: this week or next, per shop (Lidl, Biedronka, Auchan, Żabka first), search, "Z mojej listy", discount in percent, price per kilo/litre, a badge when a deal needs the shop's app. On top, **Warto kupić teraz**: `highlights()` takes the best current deals per staple of `WATCHED` (kurczak, indyk, wołowina, wieprzowina, mięso mielone, łosoś, skyr, serek wiejski, twaróg, jogurt, jajka) cheapest per kilo first, listed or not; offers with no pack are compared at the usual pack and marked "ok.". There is no background job: `DealsRefresh` shows when the data is from and refreshes it itself once when the screen opens with data older than 12 h (Lidl, leaflets, feeds, shelves, each in a call of its own). Other chains have no public catalogue: Carrefour and Kaufland refuse plain requests (even their sitemaps), Żabka, Netto, Dino, Aldi and Leclerc publish none. Every price on a screen says its source and day (`source.ts`: "Gazetka Biedronka, s. 48 · 20.10", "Sklep online Auchan · 20.10", "lidl.pl", "Stała cena Lidla") with a link to see it; `ShopPromo.fetchedAt` carries the day. Each source replaces only its own `shop_promos` rows (by product-key prefix `lidl:` / `blix:`). `match.ts` holds the keyword rules, each item's Blix search and the usual pack of a product. Every leaflet offer a rule accepts prices the item at once, as an **estimate** (marked "szacunek"; a leaflet price naming no pack gets the usual one, marked "zakładam", with a floor so a 5,99 steak is not read as a kilo; a broad item like "warzywa" is priced at the middle offer). "Tak" on `shop_product_links` (keyed by the shop's product id or the folded leaflet name) makes it exact, remembers it week after week and stores the pack; "Nie" drops that offer and the next is used. Nothing is guessed beyond that: no offer = "brak w gazetce", and my own prices (`shop_prices`, typed per item on the "Wpisz ceny z półki" sheet, `bulk-prices.tsx`) fill the gaps. `basket.ts` is the arithmetic (whole packs rounded up so the amount is always covered, multi-buys in whole multiples; each shop's total is what it prices, with the count of items it has no price for; shops pricing at least half the list are compared on the items all of them price, and "taniej" shows only when that covers 60% of the list). Both are client-safe so ticking an item off updates the card at once. A refresh replaces that source's `shop_promos` rows; when one source fails the other is still saved.
- AI is optional and isolated to `src/lib/meals/ai-estimate.ts` (Anthropic SDK, structured output). Without `ANTHROPIC_API_KEY` the option hides and everything else works.
- Deployment: GitHub → Vercel → Supabase → Google Sheets, documented in `DEPLOY.md`. Functions run in `fra1` (`vercel.json`), next to the Supabase database; keep the two in the same region. No Docker, no VPS, no local filesystem writes. All configuration is read in `src/lib/env.ts` and nowhere else; only `NEXT_PUBLIC_*` may reach the browser. `GET /api/health` is the one public route.
- Before each task: `npm run lint && npm run typecheck && npm run build` must pass.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
