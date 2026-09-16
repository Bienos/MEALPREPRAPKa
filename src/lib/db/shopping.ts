import "server-only";
import { z } from "zod";

import { getSupabase } from "@/lib/supabase/server";
import { ok, row, rows } from "./helpers";

const shoppingItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  quantity: z.coerce.number().nullable(),
  unit: z.string().nullable(),
  source: z.enum(["prep", "manual"]),
  checked: z.boolean(),
});
export type ShoppingItem = z.infer<typeof shoppingItemSchema>;

export type NewShoppingItem = {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  source?: "prep" | "manual";
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

export async function removeShoppingItem(id: string): Promise<void> {
  ok(await getSupabase().from("shopping_items").delete().eq("id", id));
}
