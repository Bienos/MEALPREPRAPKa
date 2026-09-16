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

export async function consumePortion(id: string, status: "eaten" | "discarded" = "eaten"): Promise<void> {
  ok(
    await getSupabase()
      .from("portions")
      .update({ status, consumed_at: new Date().toISOString() })
      .eq("id", id),
  );
}
