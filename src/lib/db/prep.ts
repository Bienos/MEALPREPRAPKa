import "server-only";
import { z } from "zod";

import { getSupabase } from "@/lib/supabase/server";
import {
  dayTypeSchema,
  isoDateSchema,
  macrosSchema,
  ok,
  row,
  rows,
  type DayType,
  type IsoDate,
  type Macros,
} from "./helpers";

const batchSchema = macrosSchema.extend({
  id: z.uuid(),
  meal_key: z.string().nullable(),
  meal_name: z.string(),
  variant: dayTypeSchema.nullable(),
  cooked_on: isoDateSchema,
  portions_made: z.number().int(),
  note: z.string().nullable(),
});
export type PrepBatch = z.infer<typeof batchSchema>;

export const portionLocations = ["fridge", "freezer"] as const;
export type PortionLocation = (typeof portionLocations)[number];

const portionSchema = z.object({
  id: z.uuid(),
  batch_id: z.uuid(),
  location: z.enum(portionLocations),
  status: z.enum(["available", "eaten", "discarded"]),
  expires_on: isoDateSchema.nullable(),
  consumed_at: z.string().nullable(),
});
export type Portion = z.infer<typeof portionSchema>;

/** A portion together with the batch it came from (name and per-portion macros). */
const portionWithBatchSchema = portionSchema.extend({ batch: batchSchema });
export type PortionWithBatch = z.infer<typeof portionWithBatchSchema>;

export type NewPrepBatch = Macros & {
  meal_key?: string | null;
  meal_name: string;
  variant?: DayType | null;
  cooked_on?: IsoDate;
  portions_made: number;
  note?: string | null;
  /** Where the portions go initially. Defaults to fridge. */
  location?: PortionLocation;
  expires_on?: IsoDate | null;
};

/** Records a cooked batch and creates one portion row per portion made. */
export async function createPrepBatch(input: NewPrepBatch): Promise<PrepBatch> {
  const { location = "fridge", expires_on = null, ...batchInput } = input;
  const db = getSupabase();

  const batch = row(batchSchema, await db.from("prep_batches").insert(batchInput).select("*").single());

  const portions = Array.from({ length: batch.portions_made }, () => ({
    batch_id: batch.id,
    location,
    expires_on,
  }));
  ok(await db.from("portions").insert(portions));

  return batch;
}

export async function listPrepBatches(limit = 50): Promise<PrepBatch[]> {
  const result = await getSupabase()
    .from("prep_batches")
    .select("*")
    .order("cooked_on", { ascending: false })
    .limit(limit);
  return rows(batchSchema, result);
}

/** Batches cooked in a date range, for history. */
export async function listPrepBatchesBetween(from: IsoDate, to: IsoDate): Promise<PrepBatch[]> {
  const result = await getSupabase()
    .from("prep_batches")
    .select("*")
    .gte("cooked_on", from)
    .lte("cooked_on", to)
    .order("cooked_on", { ascending: false });
  return rows(batchSchema, result);
}

/** Everything currently in the fridge or freezer. */
export async function listAvailablePortions(): Promise<PortionWithBatch[]> {
  const result = await getSupabase()
    .from("portions")
    .select("*, batch:prep_batches(*)")
    .eq("status", "available")
    .order("expires_on", { ascending: true, nullsFirst: false });
  return rows(portionWithBatchSchema, result);
}

export async function movePortion(id: string, location: PortionLocation, expiresOn?: IsoDate | null): Promise<void> {
  const patch = expiresOn === undefined ? { location } : { location, expires_on: expiresOn };
  ok(await getSupabase().from("portions").update(patch).eq("id", id));
}

/** Puts a consumed portion back, used when ZJEDZONE is undone. */
export async function restorePortion(id: string): Promise<void> {
  ok(
    await getSupabase()
      .from("portions")
      .update({ status: "available", consumed_at: null })
      .eq("id", id),
  );
}

/** ZAMROŹ: move a portion from the fridge to the freezer. */
export async function freezePortion(id: string): Promise<void> {
  ok(await getSupabase().from("portions").update({ location: "freezer" }).eq("id", id));
}

/**
 * Consumes ONE available portion of a meal, earliest expiry first, and returns
 * its id. Used when a meal is marked eaten on Today so the fridge keeps itself
 * up to date. Returns null when nothing matches.
 */
export async function consumeEarliestPortion(
  mealKey: string,
  variant: DayType | null,
): Promise<string | null> {
  const available = await listAvailablePortions();
  const matching = available.filter((portion) => portion.batch.meal_key === mealKey);
  // Prefer the exact variant; fall back to any portion of the same dish.
  const sameVariant = matching.filter((portion) => portion.batch.variant === variant);
  const pool = sameVariant.length > 0 ? sameVariant : matching;
  if (pool.length === 0) return null;

  // listAvailablePortions already orders by expiry, nulls last.
  const chosen = pool[0];
  await consumePortion(chosen.id, "eaten");
  return chosen.id;
}

export async function consumePortion(id: string, status: "eaten" | "discarded" = "eaten"): Promise<void> {
  ok(
    await getSupabase()
      .from("portions")
      .update({ status, consumed_at: new Date().toISOString() })
      .eq("id", id),
  );
}
