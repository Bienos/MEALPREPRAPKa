import "server-only";
import { unstable_cache } from "next/cache";
import { z } from "zod";

import { getSupabase } from "@/lib/supabase/server";
import { dayTypeSchema, macrosSchema, ok, row, rows, type DayType, type Macros } from "./helpers";

const settingsSchema = z.object({
  default_day_type: dayTypeSchema,
  meal_slots: z.array(z.string()),
  timezone: z.string(),
});
export type Settings = z.infer<typeof settingsSchema>;

/**
 * Settings and targets are edited by hand in Supabase, a few times a year, and
 * every screen reads them first. Caching them for a few minutes saves a
 * database round trip on every page; an edit shows up within that window.
 */
const SETTINGS_REVALIDATE_SECONDS = 5 * 60;

export const getSettings = unstable_cache(
  async (): Promise<Settings> => {
    const result = await getSupabase().from("settings").select("*").eq("id", true).single();
    return row(settingsSchema, result);
  },
  ["settings"],
  { revalidate: SETTINGS_REVALIDATE_SECONDS },
);

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  ok(await getSupabase().from("settings").update(patch).eq("id", true));
}

const targetsRowSchema = macrosSchema.extend({ day_type: dayTypeSchema });

/** Daily macro targets keyed by day type. */
export const getTargets = unstable_cache(
  async (): Promise<Record<DayType, Macros>> => {
    const result = await getSupabase().from("day_targets").select("*");
    const list = rows(targetsRowSchema, result);
    const byType = Object.fromEntries(
      list.map(({ day_type, ...macros }) => [day_type, macros]),
    ) as Partial<Record<DayType, Macros>>;
    if (!byType.DT || !byType.DNT) throw new Error("day_targets is missing DT or DNT row");
    return { DT: byType.DT, DNT: byType.DNT };
  },
  ["day-targets"],
  { revalidate: SETTINGS_REVALIDATE_SECONDS },
);

export async function updateTargets(dayType: DayType, macros: Macros): Promise<void> {
  ok(await getSupabase().from("day_targets").update(macros).eq("day_type", dayType));
}
