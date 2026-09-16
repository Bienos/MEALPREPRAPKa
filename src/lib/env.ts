import "server-only";
import { z } from "zod";

/** Core environment. Required for the app to run at all (password gate + database). */
const coreSchema = z.object({
  APP_PASSWORD: z.string().min(8, "APP_PASSWORD must be at least 8 characters"),
  SUPABASE_URL: z.url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SECRET_KEY: z.string().min(1, "SUPABASE_SECRET_KEY is required"),
});

/**
 * Google Sheets access. Validated separately so a missing service account only
 * affects the meal library, never the password gate or the rest of the app.
 */
const googleSchema = z.object({
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().min(1, "GOOGLE_SHEETS_SPREADSHEET_ID is required"),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.email("GOOGLE_SERVICE_ACCOUNT_EMAIL must be an email"),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z
    .string()
    .min(1, "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is required")
    // .env files and Vercel store the PEM with literal "\n" sequences.
    .transform((key) => key.replace(/\\n/g, "\n").replace(/^"|"$/g, "")),
  GOOGLE_SHEETS_TARGET_GID: z.coerce.number().int().nonnegative().default(965578947),
});

export type Env = z.infer<typeof coreSchema>;
export type GoogleEnv = z.infer<typeof googleSchema>;

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
let cachedGoogle: GoogleEnv | undefined;

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

/** True when the Google service account is configured at all. */
export function hasGoogleEnv(): boolean {
  return Boolean(
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  );
}

export function getGoogleEnv(): GoogleEnv {
  cachedGoogle ??= parse(googleSchema, {
    GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    GOOGLE_SHEETS_TARGET_GID: process.env.GOOGLE_SHEETS_TARGET_GID,
  });
  return cachedGoogle;
}
