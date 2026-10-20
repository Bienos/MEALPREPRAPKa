import "server-only";
import { z } from "zod";

import { getSupabase } from "@/lib/supabase/server";
import type { DeliveryQuote } from "@/lib/prices/delivery";
import { ok, rows } from "./helpers";

const quoteRowSchema = z.object({
  provider: z.string(),
  fee: z.coerce.number().nullable(),
  free_above: z.coerce.number().nullable(),
  min_order: z.coerce.number().nullable(),
  confirmed: z.boolean(),
  note: z.string(),
});

/** What I know about each provider's delivery: typed by me, estimate or confirmed at checkout. */
export async function listDeliveryQuotes(): Promise<DeliveryQuote[]> {
  const result = await getSupabase().from("delivery_quotes").select("*");
  return rows(quoteRowSchema, result).map((row) => ({
    provider: row.provider,
    fee: row.fee,
    freeAbove: row.free_above,
    minOrder: row.min_order,
    confirmed: row.confirmed,
    note: row.note,
  }));
}

export async function upsertDeliveryQuote(quote: DeliveryQuote): Promise<void> {
  ok(
    await getSupabase().from("delivery_quotes").upsert(
      {
        provider: quote.provider,
        fee: quote.fee,
        free_above: quote.freeAbove,
        min_order: quote.minOrder,
        confirmed: quote.confirmed,
        note: quote.note,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    ),
  );
}
