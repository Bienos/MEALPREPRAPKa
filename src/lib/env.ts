import "server-only";
import { z } from "zod";

/**
 * All environment access lives here. Nothing outside this file reads
 * process.env for configuration, so there is exactly one place to audit.
 *
 * Only NEXT_PUBLIC_* values may ever reach the browser. Everything below is
 * read in server code only, and this module is `server-only` so importing it
 * from a client component is a build error rather than a silent leak.
 */

/**
 * Vercel stores multi-line values with literal "\n" sequences, and pasting a
 * PEM often adds wrapping quotes. This is the single place that normalizes
 * them back into a real key; nothing else parses credentials.
 */
export function normalizePrivateKey(raw: string): string {
  return raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n");
}

/** Reads the first of several names that is set, so old and new names both work. */
function firstOf(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim() !== "") return value;
  }
  return undefined;
}

/* Core: the app cannot run without these ------------------------------------ */

const coreSchema = z.object({
  APP_PASSWORD: z.string().min(8, "APP_PASSWORD must be at least 8 characters"),
  /** Signs the session cookie. Falls back to APP_PASSWORD when unset. */
  SESSION_SECRET: z.string().min(8, "SESSION_SECRET must be at least 8 characters"),
  SUPABASE_URL: z.url("Supabase URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "A Supabase service role / secret key is required"),
});

const sheetsSchema = z.object({
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().min(1, "GOOGLE_SHEETS_SPREADSHEET_ID is required"),
  GOOGLE_SHEETS_TARGET_GID: z.coerce.number().int().nonnegative().default(965578947),
});

const serviceAccountSchema = z.object({
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.email("GOOGLE_SERVICE_ACCOUNT_EMAIL must be an email"),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z
    .string()
    .min(1, "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is required")
    .transform(normalizePrivateKey),
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
    throw new Error(`Invalid environment variables:\n${issues}\nSee .env.example and DEPLOY.md.`);
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
    // A dedicated secret is better, but falling back keeps one-variable setups working.
    SESSION_SECRET: firstOf("SESSION_SECRET", "APP_PASSWORD"),
    // The project URL is not a secret, so the NEXT_PUBLIC_ name is the canonical one.
    SUPABASE_URL: firstOf("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: firstOf("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"),
  });
  return cachedCore;
}

/**
 * True when a Supabase project is configured. Checked without parsing so the
 * health endpoint can report it without throwing on a half-configured deploy.
 */
export function hasDatabaseEnv(): boolean {
  return Boolean(
    firstOf("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL") &&
      firstOf("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"),
  );
}

/** True when enough is configured to attempt reading the meal library at all. */
export function hasSheetsEnv(): boolean {
  return Boolean(firstOf("GOOGLE_SHEETS_SPREADSHEET_ID"));
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
  return Boolean(
    firstOf("GOOGLE_SERVICE_ACCOUNT_EMAIL") && firstOf("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"),
  );
}

export function getServiceAccountEnv(): ServiceAccountEnv {
  cachedServiceAccount ??= parse(serviceAccountSchema, {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  });
  return cachedServiceAccount;
}

/**
 * Optional natural-language food estimation. The core app never needs it, so
 * the feature hides itself when the key is absent.
 */
export function hasAnthropicKey(): boolean {
  return Boolean(firstOf("ANTHROPIC_API_KEY"));
}
