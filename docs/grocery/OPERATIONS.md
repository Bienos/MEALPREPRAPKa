# Operations

## Deploy

1. Apply `supabase/migrations/20261020120000_grocery_foundation.sql` **before** deploying the code (SQL editor
   or `npx supabase db push`). Until it is applied the app keeps working: the shopping card simply has no
   history prices, and the sources and receipts screens say the migration is missing.
2. Environment variables (all optional):

| Variable | Default | Effect |
|---|---|---|
| `GROCERY_UNVERIFIED_SOURCES` | off | `on` reads lidl.pl, Blix, Biedronka/Auchan online and Stokrotka's feed again, for private use. Their prices stay "niezweryfikowane". **Before this change these sources ran by default; after deploying, they stay off until you set it.** |
| `OPEN_FOOD_FACTS_CONTACT` | repository URL | Contact put in the User-Agent Open Food Facts asks for |
| `GS1_EPRODUKTY_API_KEY` | unset | Only reported as present; GS1 is not wired |
| `CRON_SECRET` | unset | Unchanged: enables the daily refresh |

3. The daily cron (`/api/refresh-prices`, 04:00 UTC) now also syncs Open Prices. Disabled sources report
   `disabled` in its JSON report.

## Monitoring

**Prep → Zakupy → Źródła danych** (`/prep/zrodla`): per provider whether it runs now, its permission,
licence, limits, number of stored prices and the newest, last success, last error; the last 15 sync runs
with fetched/imported/rejected/duplicates and rejection reasons ("spoza Polski", "duplikat", "starsze niż 90
dni", …). The same data is in `grocery_providers`, `grocery_sync_runs` and the `grocery_price_counts` view.

Signals to act on:
- A provider with "błąd" and an old "Ostatnio OK": the source changed or is down. Its stored data is untouched.
- "zepsuta odpowiedź": more than half of a response unreadable. The sync stopped and kept the old data.
- Many "skok ceny" warnings: a source's prices jumped more than 60 % against earlier observations.
- Frisco's newest price older than a day: the 12-hour refresh is not running (cron or tapping "Sprawdź").

## Failure handling

- Every source is read and validated before anything is written; a failure records the error on the provider
  and leaves earlier data in place. One source failing never stops the others (cron and buttons).
- Open Prices: incremental with two days of overlap; duplicates are ignored by the unique (provider, record)
  key, so a re-run is safe.
- Bookkeeping never breaks a read: if sync runs cannot be recorded (migration missing), the read still runs.
- Prices are never "current" by storage: an old row turns historical, then expired, by age.

## Rate limits and abuse protection

- Every page and server action is behind the password session (`src/proxy.ts`); only `/api/health` and the
  cron route (secret) are public.
- Manual Open Prices sync: at most once per 5 minutes. Open Food Facts: 4.1 s between product reads, 6.1 s
  between searches, results cached 30 days. Auchan: stops at the first 202. Server actions validate every input
  with Zod (sizes, enums, dates, GTIN check digits).

## Receipts and privacy

- The photo never reaches the server; text is redacted in the browser and again on the server.
- Deleting a receipt deletes its lines, ledger prices, private evidence and queued shares (verified).
- Sharing is per line, off by default, anonymized, and leaves only as a CSV the owner downloads.

## Verification commands

```
npm run lint && npm run typecheck && npm test && npm run build
node scripts/warsaw-pilot.mts            # live coverage measurement (~12 min, Open Food Facts rate limit)
node scripts/warsaw-pilot.mts --skip-off # without Open Food Facts searches (~1 min)
```

## Going multi-user (not ready)

The app is one person's private tool. Before serving other people:
- **Authentication**: real accounts (Supabase Auth or similar) instead of one shared password; password reset;
  rate-limited login.
- **Authorization and isolation**: a `user_id` on every operational table (settings, shopping, receipts,
  contributions, typed prices, links) with RLS policies per user; no service-key reads on behalf of users.
- **GDPR**: receipts are personal data — a legal basis, a retention period, export and deletion per user,
  a processing record, a DPIA for receipt processing; consent records for contributions.
- **Licences**: commercial permission for every retailer source (Frisco's is personal only), an ODbL review.
- **Load**: the daily Open Prices sync is shared; per-user pricing stays in the browser.
