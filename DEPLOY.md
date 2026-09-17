# Wdrożenie / Deployment

GitHub → Vercel → Supabase → Google Sheets. No Docker, no server to maintain.
After the first setup, every future update is just `git push`.

Budget about 30 minutes for the first run.

---

## 1. Supabase (the database)

1. Go to [supabase.com](https://supabase.com) and create a project. Any region
   near you is fine. Save the database password it shows you.
2. Open **Project Settings → API**. You need two values:
   - **Project URL** → this is `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role** key (or the newer `sb_secret_...` key) → this is
     `SUPABASE_SERVICE_ROLE_KEY`. It has full database access, so it only ever
     goes into server-side environment variables, never into the browser.
3. Run the database migrations. The SQL lives in `supabase/migrations/`, and
   the files must run **in filename order**.

   **Easiest way (no tooling):** open **SQL Editor** in the Supabase dashboard,
   then for each file in `supabase/migrations/`, oldest first, paste its
   contents and press **Run**.

   **With the CLI:**

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

   `YOUR_PROJECT_REF` is the part of the project URL before `.supabase.co`.

4. Check it worked: **Table Editor** should list `settings`, `day_targets`,
   `day_plans`, `planned_meals`, `default_day_meals`, `prep_sessions`,
   `prep_session_items`, `prep_batches`, `portions`, `shopping_items`,
   `pantry_staples` and `weight_logs`. `day_targets` should already hold two
   rows, DT 2460 kcal and DNT 2360 kcal.

---

## 2. Google Sheets (the meal library)

The sheet stays the source of truth for meals. There are two ways to let the
app read it. Option A is much simpler; pick B only if the sheet must stay private.

### Option A — link sharing (no Google Cloud account needed)

1. Open your meal spreadsheet.
2. **Share → General access → Anyone with the link → Viewer.**
3. Done. Leave `GOOGLE_SERVICE_ACCOUNT_*` empty.

Trade-off: anyone who has the exact link can read the sheet. It is not indexed
or searchable, but it is not access-controlled either.

### Option B — service account (sheet stays private)

1. Create a project at
   [console.cloud.google.com/projectcreate](https://console.cloud.google.com/projectcreate).
2. Enable the Sheets API:
   [console.cloud.google.com/apis/library/sheets.googleapis.com](https://console.cloud.google.com/apis/library/sheets.googleapis.com)
   → **Enable**. Check the project selector at the top first.
3. Create the account:
   [console.cloud.google.com/iam-admin/serviceaccounts/create](https://console.cloud.google.com/iam-admin/serviceaccounts/create).
   Name it `mealprep`, skip both optional steps, press **Done**.
4. Open the account → **Keys → Add key → Create new key → JSON**. A file downloads.
5. From that file take `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and
   `private_key` → `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`. Paste the key on one
   line, keeping the `\n` sequences exactly as they appear.
6. **Share the spreadsheet with that `client_email` address as Viewer.**
   Without this step the app gets a 403 even with a valid key.

> Some Google accounts block service-account keys with an organisation policy
> (`iam.disableServiceAccountKeyCreation`). If step 4 is blocked and you are not
> the org admin, use Option A.

Either way, keep this set:

```
GOOGLE_SHEETS_SPREADSHEET_ID=10-ncMSZQxVM7n93-F2cPl2vQWz0atXexrzKieQAE1sI
```

You can paste the whole sheet URL instead of the id. The app already knows which
tab holds the meal table (gid `894227705`). Only if that table ever moves to a
different tab, open it and set `GOOGLE_SHEETS_TARGET_GID` to the `gid=` number
from the address bar (the full URL works there too).

If Google is unreachable the app keeps working: it serves the last meal library
it successfully loaded and shows a short Polish notice instead of failing.

---

## 3. GitHub

If the project is not on GitHub yet:

```bash
git init
git add .
git commit -m "MealPrep"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

`.gitignore` already excludes `.env*` (except `.env.example`), `node_modules`,
`.next`, build output and `*.pem`. Never commit real keys.

---

## 4. Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repo.
2. Framework preset: **Next.js**. Leave build and output settings alone.
3. Before deploying, open **Environment Variables** and add:

   | Variable | Required | Value |
   | --- | --- | --- |
   | `APP_PASSWORD` | yes | your app password, min 8 characters |
   | `SESSION_SECRET` | recommended | `openssl rand -base64 32` |
   | `NEXT_PUBLIC_SUPABASE_URL` | yes | from step 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | yes | from step 1 |
   | `GOOGLE_SHEETS_SPREADSHEET_ID` | yes | the id above, or the sheet URL |
   | `GOOGLE_SHEETS_TARGET_GID` | optional | defaults to the meal-library tab |
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | option B only | from step 2 |
   | `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | option B only | from step 2, one line with `\n` |
   | `ANTHROPIC_API_KEY` | optional | enables food estimation from a description |
   | `NEXT_PUBLIC_APP_URL` | optional | your production URL |

   Apply them to **Production**, **Preview** and **Development**.

4. Press **Deploy**. First build takes a couple of minutes.

If a variable is wrong, the app says which one: the server throws a named
validation error rather than failing silently.

---

## 5. Verify

Open the `*.vercel.app` URL and check, in order:

1. **Health** — visit `/api/health`. Expect `{"status":"ok", ...}`.
2. **Login** — you should land on the password screen. A wrong password is
   rejected in Polish; the right one takes you to **Dziś**.
3. **Meals** — open **Posiłki**. Your real meals should be listed, grouped into
   categories, with DT/DNT variants on one card.
4. **Sheet sync** — press **Synchronizuj** on Posiłki. It should report how many
   meals it loaded. Edit a meal name in the sheet, sync again, see it change.
5. **Supabase state** — on **Dziś**, set the day to DT or DNT, then reload the
   page. The choice must survive the reload. That proves the database works.
6. **Today** — set a default day if prompted, apply it, then tap **ZJEDZONE** on
   the next meal. Remaining macros should drop immediately and an Undo toast appears.
7. **Prep** — open **Prep**, pick 3 days, press **ZBUDUJ PREP**. You should get
   dishes with portion counts and a shopping list.
8. **PWA** — see step 6 below; the installed app should open without a browser
   address bar.

---

## 6. Install on iPhone

1. Open the production URL in **Safari** (not Chrome).
2. Tap **Share** (the square with an arrow).
3. Tap **Add to Home Screen**.
4. Open the installed app from the Home Screen.

It runs full screen, respects the notch and home indicator, and keeps you
logged in for 30 days.

---

## 7. Updating later

```bash
git add .
git commit -m "opis zmiany"
git push
```

Vercel rebuilds and redeploys automatically, usually within a couple of
minutes. No server to restart.

---

## 8. Database changes later

Schema changes are SQL files in `supabase/migrations/`, one file per change,
named with a timestamp so they run in order. Never edit a file that has already
been applied; add a new one.

To apply a new migration to production:

```bash
npx supabase db push
```

Or paste the new file into the Supabase **SQL Editor** and press **Run**.

Two habits worth keeping: apply the migration **before** deploying code that
depends on it, and take a backup first (**Database → Backups**) if the change
drops or rewrites anything.

---

## Optional: custom domain

Not required — the app works fully on `*.vercel.app`.

1. Vercel project → **Settings → Domains → Add**.
2. Enter your domain and follow the DNS records Vercel shows you, usually a
   `CNAME` to `cname.vercel-dns.com` at your registrar.
3. Wait for the certificate to be issued, which is automatic.

If you add a domain, update `NEXT_PUBLIC_APP_URL` and re-add the app to your
Home Screen so the icon points at the new address.
