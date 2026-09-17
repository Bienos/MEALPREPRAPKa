import "server-only";
import { z } from "zod";

import { getSupabase } from "@/lib/supabase/server";
import { ok, rows } from "./helpers";

const stapleSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  in_stock: z.boolean(),
});
export type PantryStaple = z.infer<typeof stapleSchema>;

/**
 * Things normally already at home. While in stock they are left off the
 * shopping list; marking one out of stock puts it back on the next one.
 */
export async function listPantryStaples(): Promise<PantryStaple[]> {
  const result = await getSupabase().from("pantry_staples").select("*").order("name");
  return rows(stapleSchema, result);
}

export async function setStapleInStock(id: string, inStock: boolean): Promise<void> {
  ok(await getSupabase().from("pantry_staples").update({ in_stock: inStock }).eq("id", id));
}

export async function addStaple(name: string): Promise<void> {
  ok(await getSupabase().from("pantry_staples").upsert({ name: name.trim().toLowerCase() }, { onConflict: "name" }));
}

export async function removeStaple(id: string): Promise<void> {
  ok(await getSupabase().from("pantry_staples").delete().eq("id", id));
}
