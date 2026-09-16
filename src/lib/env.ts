import "server-only";
import { z } from "zod";

const envSchema = z.object({
  APP_PASSWORD: z.string().min(8, "APP_PASSWORD must be at least 8 characters"),
  SUPABASE_URL: z.url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SECRET_KEY: z.string().min(1, "SUPABASE_SECRET_KEY is required"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Validated server-side environment. Parsed lazily on first use so that
 * `next build` does not require real secrets, but the first request does.
 */
export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse({
    APP_PASSWORD: process.env.APP_PASSWORD,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}\nSee .env.example.`);
  }

  cached = parsed.data;
  return cached;
}
