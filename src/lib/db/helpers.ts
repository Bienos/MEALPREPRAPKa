import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";

export const dayTypeSchema = z.enum(["DT", "DNT"]);
export type DayType = z.infer<typeof dayTypeSchema>;

export const macrosSchema = z.object({
  kcal: z.coerce.number(),
  protein_g: z.coerce.number(),
  fat_g: z.coerce.number(),
  carbs_g: z.coerce.number(),
});
export type Macros = z.infer<typeof macrosSchema>;

/** ISO date `YYYY-MM-DD` as stored in `date` columns. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export type IsoDate = z.infer<typeof isoDateSchema>;

type Result<T> = { data: T | null; error: PostgrestError | null };

/** Throws on a Supabase error, otherwise validates and returns the rows. */
export function rows<S extends z.ZodTypeAny>(schema: S, result: Result<unknown>): z.infer<S>[] {
  if (result.error) throw new Error(`Database error: ${result.error.message}`);
  return z.array(schema).parse(result.data ?? []);
}

/** Like `rows`, but expects exactly one row (use with `.single()`). */
export function row<S extends z.ZodTypeAny>(schema: S, result: Result<unknown>): z.infer<S> {
  if (result.error) throw new Error(`Database error: ${result.error.message}`);
  return schema.parse(result.data);
}

/** Like `row`, but tolerates no row (use with `.maybeSingle()`). */
export function maybeRow<S extends z.ZodTypeAny>(schema: S, result: Result<unknown>): z.infer<S> | null {
  if (result.error) throw new Error(`Database error: ${result.error.message}`);
  return result.data == null ? null : schema.parse(result.data);
}

/** Throws on a Supabase error for statements that return nothing. */
export function ok(result: { error: PostgrestError | null }): void {
  if (result.error) throw new Error(`Database error: ${result.error.message}`);
}
