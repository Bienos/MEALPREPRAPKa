import "server-only";
import { z } from "zod";

/** Core environment. Required for the app to run at all (password gate + database). */
const coreSchema = z.object({
  APP_PASSWORD: z.string().min(8, "APP_PASSWORD must be at least 8 characters"),
  SUPABASE_URL: z.url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SECRET_KEY: z.string().min(1, "SUPABASE_SECRET_KEY is required"),
});

/**
 * Which spreadsheet and tab to read. This alone is enough to read a sheet that
 * is shared as "Anyone with the link — Viewer" (no Google credentials needed).
 */
const sheetsSchema = z.object({
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().min(1, "GOOGLE_SHEETS_SPREADSHEET_ID is required"),
  GOOGLE_SHEETS_TARGET_GID: z.coerce.number().int().nonnegative().default(965578947),
});

/**
 * Optional service-account credentials. When present, the app reads the sheet
 * through the authenticated Sheets API instead of the public CSV export, which
 * also lets it resolve the tab's display name. Validated separately so a
 * missing or misconfigured service account never breaks the password gate or
 * the rest of the app — it just falls back to the public path.
 */
const serviceAccountSchema = z.object({
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.email("GOOGLE_SERVICE_ACCOUNT_EMAIL must be an email"),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z
    .string()
    .min(1, "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is required")
    // .env files and Vercel store the PEM with literal "\n" sequences.
    .transform((key) => key.replace(/\\n/g, "\n").replace(/^"|"$/g, "")),
});

export type Env = z.infer<typeof coreSchema>;
export type SheetsEnv = z.infer<typeof sheetsSchema>;
export type ServiceAccountEnv = z.infer<typeof serviceAccountSchema>;

function parse<S extends z.ZodTypeAny>(schema: S, values: Record<string, unknown>): z.infer<S> {
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}\nSee .env.example.`);
  }
  return parsed.data;
}

let cachedCore: Env | undefined;
let cachedSheets: SheetsEnv | undefined;
let cachedServiceAccount: ServiceAccountEnv | undefined;

/**
 * Validated core environment. Parsed lazily on first use so that `next build`
 * does not require real secrets, but the first request does.
 */
export function getEnv(): Env {
  cachedCore ??= parse(coreSchema, {
    APP_PASSWORD: process.env.APP_PASSWORD,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
  return cachedCore;
}

/** True when enough is configured to attempt reading the meal library at all. */
export function hasSheetsEnv(): boolean {
  return Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
}

export function getSheetsEnv(): SheetsEnv {
  cachedSheets ??= parse(sheetsSchema, {
    GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
    GOOGLE_SHEETS_TARGET_GID: process.env.GOOGLE_SHEETS_TARGET_GID,
  });
  return cachedSheets;
}

/** True when a service account is configured, enabling the authenticated (private) path. */
export function hasServiceAccountEnv(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

export function getServiceAccountEnv(): ServiceAccountEnv {
  cachedServiceAccount ??= parse(serviceAccountSchema, {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  });
  return cachedServiceAccount;
}
