import "server-only";
import { z } from "zod";

import { getSupabase } from "@/lib/supabase/server";
import { ok, row, rows } from "./helpers";

export const shoppingCategories = ["meat", "dairy", "carbs", "vegetables", "fruit", "other"] as const;
export type ShoppingCategoryValue = (typeof shoppingCategories)[number];

const shoppingItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  quantity: z.coerce.number().nullable(),
  unit: z.string().nullable(),
  source: z.enum(["prep", "manual"]),
  category: z.enum(shoppingCategories),
  checked: z.boolean(),
  /** "I already have this" — kept apart from `checked`, which means bought. */
  owned: z.boolean(),
});
export type ShoppingItem = z.infer<typeof shoppingItemSchema>;

export type NewShoppingItem = {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  source?: "prep" | "manual";
  category?: ShoppingCategoryValue;
};

export async function listShoppingItems(): Promise<ShoppingItem[]> {
  const result = await getSupabase()
    .from("shopping_items")
    .select("*")
    .order("checked")
    .order("created_at");
  return rows(shoppingItemSchema, result);
}

export async function addShoppingItem(input: NewShoppingItem): Promise<ShoppingItem> {
  const result = await getSupabase().from("shopping_items").insert(input).select("*").single();
  return row(shoppingItemSchema, result);
}

/** Replaces the auto-generated (prep) part of the list, keeping manual items. */
export async function replacePrepShoppingItems(items: Omit<NewShoppingItem, "source">[]): Promise<void> {
  const db = getSupabase();
  ok(await db.from("shopping_items").delete().eq("source", "prep"));
  if (items.length > 0) {
    ok(await db.from("shopping_items").insert(items.map((item) => ({ ...item, source: "prep" }))));
  }
}

export async function setShoppingItemChecked(id: string, checked: boolean): Promise<void> {
  ok(await getSupabase().from("shopping_items").update({ checked }).eq("id", id));
}

/** "Mam to w domu" — keeps the row but takes it out of the active list. */
export async function setShoppingItemOwned(id: string, owned: boolean): Promise<void> {
  ok(await getSupabase().from("shopping_items").update({ owned }).eq("id", id));
}

export async function clearCheckedShoppingItems(): Promise<void> {
  ok(await getSupabase().from("shopping_items").delete().eq("checked", true));
}

export async function removeShoppingItem(id: string): Promise<void> {
  ok(await getSupabase().from("shopping_items").delete().eq("id", id));
}
