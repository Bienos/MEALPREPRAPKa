import "server-only";
import { z } from "zod";

import { getSupabase } from "@/lib/supabase/server";
import { isoDateSchema, ok, rows, type IsoDate } from "./helpers";

const weightLogSchema = z.object({
  date: isoDateSchema,
  weight_kg: z.coerce.number(),
  note: z.string().nullable(),
});
export type WeightLog = z.infer<typeof weightLogSchema>;

/** Most recent entries first. */
export async function listWeightLogs(limit = 90): Promise<WeightLog[]> {
  const result = await getSupabase()
    .from("weight_logs")
    .select("*")
    .order("date", { ascending: false })
    .limit(limit);
  return rows(weightLogSchema, result);
}

/** One entry per day; logging again overwrites that day's value. */
export async function logWeight(date: IsoDate, weightKg: number, note?: string | null): Promise<void> {
  ok(await getSupabase().from("weight_logs").upsert({ date, weight_kg: weightKg, note: note ?? null }));
}
