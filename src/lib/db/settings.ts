import "server-only";
import { unstable_cache } from "next/cache";
import { z } from "zod";

import { getSupabase } from "@/lib/supabase/server";
import { RETAILER_IDS, type RetailerId } from "@/lib/grocery/retailers";
import { LOYALTY_PROGRAMS, type LoyaltyProgram } from "@/lib/grocery/types";
import { dayTypeSchema, macrosSchema, ok, row, rows, type DayType, type Macros } from "./helpers";

const settingsSchema = z.object({
  default_day_type: dayTypeSchema,
  meal_slots: z.array(z.string()),
  timezone: z.string(),
  /** The town the shopping comparison is for (online shops deliver to some towns only). */
  shopping_city: z.string().default("Warszawa"),
  /** Shops on the corner, online delivery, or both. */
  shopping_channel: z.enum(["store", "online", "both"]).default("both"),
  /** Loyalty apps and cards I have: app-only prices count only for these. */
  // Unknown values (a program renamed later) are dropped, never thrown: every screen reads settings.
  loyalty_programs: z
    .array(z.string())
    .default([])
    .transform((list) => list.filter((one): one is LoyaltyProgram => (LOYALTY_PROGRAMS as readonly string[]).includes(one))),
  preferred_retailers: z
    .array(z.string())
    .default([])
    .transform((list) => list.filter((one): one is RetailerId => (RETAILER_IDS as readonly string[]).includes(one))),
  /** Brands never to suggest, folded. */
  excluded_brands: z.array(z.string()).default([]),
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
  { revalidate: SETTINGS_REVALIDATE_SECONDS, tags: ["settings"] },
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
    const byType = Object.fromEntries(list.map(({ day_type, ...macros }) => [day_type, macros])) as Partial<
      Record<DayType, Macros>
    >;
    if (!byType.DT || !byType.DNT) throw new Error("day_targets is missing DT or DNT row");
    return { DT: byType.DT, DNT: byType.DNT };
  },
  ["day-targets"],
  { revalidate: SETTINGS_REVALIDATE_SECONDS },
);

export async function updateTargets(dayType: DayType, macros: Macros): Promise<void> {
  ok(await getSupabase().from("day_targets").update(macros).eq("day_type", dayType));
}
