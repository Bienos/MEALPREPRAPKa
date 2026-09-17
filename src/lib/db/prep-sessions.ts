import "server-only";
import { z } from "zod";

import { getSupabase } from "@/lib/supabase/server";
import { dayTypeSchema, isoDateSchema, maybeRow, ok, row, rows, type DayType } from "./helpers";

export const prepStatuses = ["draft", "cooking", "done", "abandoned"] as const;
export type PrepStatus = (typeof prepStatuses)[number];

const prepDaySchema = z.object({ date: isoDateSchema, day_type: dayTypeSchema });
export type PrepDayRow = z.infer<typeof prepDaySchema>;

const sessionSchema = z.object({
  id: z.uuid(),
  status: z.enum(prepStatuses),
  days: z.array(prepDaySchema),
  current_step: z.number().int(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
});
export type PrepSession = z.infer<typeof sessionSchema>;

const itemSchema = z.object({
  id: z.uuid(),
  session_id: z.uuid(),
  position: z.number().int(),
  meal_key: z.string(),
  meal_name: z.string(),
  variant: dayTypeSchema.nullable(),
  portions: z.number().int(),
  kcal: z.coerce.number(),
  protein_g: z.coerce.number(),
  fat_g: z.coerce.number(),
  carbs_g: z.coerce.number(),
  ingredients: z.string(),
  fridge_days: z.number().int(),
  prep_minutes: z.number().int(),
});
export type PrepSessionItem = z.infer<typeof itemSchema>;

export type NewPrepSessionItem = Omit<PrepSessionItem, "id" | "session_id">;

/** The prep currently being planned or cooked, if any. */
export async function getActivePrepSession(): Promise<PrepSession | null> {
  const result = await getSupabase()
    .from("prep_sessions")
    .select("*")
    .in("status", ["draft", "cooking"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return maybeRow(sessionSchema, result);
}

/**
 * The prep finished in the last few minutes, so the app can show the
 * "prep complete" summary once before returning to a clean Prep tab.
 */
export async function getJustCompletedPrepSession(withinMinutes = 30): Promise<PrepSession | null> {
  const since = new Date(Date.now() - withinMinutes * 60_000).toISOString();
  const result = await getSupabase()
    .from("prep_sessions")
    .select("*")
    .eq("status", "done")
    .gte("completed_at", since)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return maybeRow(sessionSchema, result);
}

export async function getPrepSession(id: string): Promise<PrepSession | null> {
  const result = await getSupabase().from("prep_sessions").select("*").eq("id", id).maybeSingle();
  return maybeRow(sessionSchema, result);
}

export async function listPrepSessionItems(sessionId: string): Promise<PrepSessionItem[]> {
  const result = await getSupabase()
    .from("prep_session_items")
    .select("*")
    .eq("session_id", sessionId)
    .order("position");
  return rows(itemSchema, result);
}

/** Replaces any unfinished prep with a fresh one. Only one is ever active. */
export async function createPrepSession(days: { date: string; day_type: DayType }[]): Promise<PrepSession> {
  const db = getSupabase();
  ok(await db.from("prep_sessions").delete().in("status", ["draft", "cooking"]));
  const result = await db.from("prep_sessions").insert({ days }).select("*").single();
  return row(sessionSchema, result);
}

export async function replacePrepSessionItems(sessionId: string, items: NewPrepSessionItem[]): Promise<void> {
  const db = getSupabase();
  ok(await db.from("prep_session_items").delete().eq("session_id", sessionId));
  if (items.length > 0) {
    ok(await db.from("prep_session_items").insert(items.map((item) => ({ ...item, session_id: sessionId }))));
  }
}

export async function updatePrepSession(
  id: string,
  patch: Partial<Pick<PrepSession, "status" | "current_step">> & {
    started_at?: string | null;
    completed_at?: string | null;
    days?: { date: string; day_type: DayType }[];
  },
): Promise<void> {
  ok(await getSupabase().from("prep_sessions").update(patch).eq("id", id));
}

export async function deletePrepSession(id: string): Promise<void> {
  ok(await getSupabase().from("prep_sessions").delete().eq("id", id));
}
