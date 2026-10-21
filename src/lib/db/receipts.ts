import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";

import { getSupabase } from "@/lib/supabase/server";
import { canonicalGtin } from "@/lib/grocery/gtin";
import { linePrice, redactReceiptText, toContribution, type Contribution } from "@/lib/grocery/receipts";
import { RETAILER_IDS, type RetailerId } from "@/lib/grocery/retailers";
import { isoDateSchema, maybeRow, ok, rows } from "./helpers";

export type NewReceiptLine = {
  raw: string;
  name: string;
  gtin: string | null;
  quantity: number;
  unit: "szt" | "kg";
  unitPriceGrosz: number | null;
  totalGrosz: number;
  discountGrosz: number;
  deposit: boolean;
  /** I agreed to share this one line, anonymized. */
  share: boolean;
};

export type NewReceipt = {
  retailer: RetailerId | null;
  storeLabel: string;
  city: string | null;
  purchasedOn: string;
  totalGrosz: number | null;
  text: string;
  lines: NewReceiptLine[];
};

export class DuplicateReceiptError extends Error {}

/**
 * Saves a reviewed receipt as mine: the receipt and its lines, each product
 * line's price into the ledger as private history (kind "receipt"), and
 * the lines I chose to share into the contribution queue, anonymized. The
 * text is redacted again here, whatever the browser sent.
 */
export async function saveReceipt(receipt: NewReceipt): Promise<string> {
  const db = getSupabase();
  const redacted = redactReceiptText(receipt.text).text;
  const textHash = redacted.trim() ? createHash("sha256").update(redacted.trim()).digest("hex") : null;
  if (textHash) {
    const existing = await db.from("receipts").select("id").eq("text_hash", textHash).maybeSingle();
    if (maybeRow(z.object({ id: z.string() }), existing)) throw new DuplicateReceiptError("Ten paragon jest już zapisany.");
  }

  const inserted = await db
    .from("receipts")
    .insert({
      retailer_id: receipt.retailer,
      store_label: receipt.storeLabel,
      city: receipt.city,
      purchased_on: receipt.purchasedOn,
      total_grosz: receipt.totalGrosz,
      redacted_text: redacted,
      text_hash: textHash,
    })
    .select("id")
    .single();
  if (inserted.error) throw new Error(`Database error: ${inserted.error.message || inserted.error.code}`);
  const receiptId = z.object({ id: z.string() }).parse(inserted.data).id;

  try {
    const lineRows = rows(
      z.object({ id: z.string(), position: z.number() }),
      await db
        .from("receipt_lines")
        .insert(
          receipt.lines.map((line, position) => ({
            receipt_id: receiptId,
            position,
            raw_text: redactReceiptText(line.raw).text,
            name: line.name,
            gtin: line.gtin ? canonicalGtin(line.gtin) : null,
            quantity: line.quantity,
            unit: line.unit,
            unit_price_grosz: line.unitPriceGrosz,
            total_grosz: line.totalGrosz,
            discount_grosz: line.discountGrosz,
            deposit: line.deposit,
          })),
        )
        .select("id, position"),
    );
    const idAt = new Map(lineRows.map((row) => [row.position, row.id]));
    const priced = receipt.lines.flatMap((line, position) => {
      const price = linePrice(line);
      const id = idAt.get(position);
      return price && id ? [{ line, position, id, price }] : [];
    });

    const evidence = rows(
      z.object({ id: z.string(), provider_record_id: z.string() }),
      priced.length === 0
        ? { data: [], error: null }
        : await db
            .from("grocery_evidence")
            .insert(
              priced.map(({ line, id }) => ({
                provider_id: "receipts",
                provider_record_id: `receipt:${id}`,
                evidence_type: "receipt",
                source_url: null,
                captured_at: new Date().toISOString(),
                original: { line: redactReceiptText(line.raw).text },
                content_hash: null,
                license: null,
                verification: "user_confirmed",
                private: true,
              })),
            )
            .select("id, provider_record_id"),
    );
    const evidenceFor = new Map(evidence.map((row) => [row.provider_record_id, row.id]));

    if (priced.length > 0) {
      ok(
        await db.from("grocery_prices").insert(
          priced.map(({ line, id, price }) => ({
            provider_id: "receipts",
            provider_record_id: `receipt:${id}`,
            retailer_id: receipt.retailer,
            receipt_line_id: id,
            product_name: line.name,
            gtin: line.gtin ? canonicalGtin(line.gtin) : null,
            amount_grosz: price.amountGrosz,
            currency: "PLN",
            price_per: price.per,
            price_type: line.discountGrosz > 0 ? "promotion" : "regular",
            kind: "receipt",
            observed_at: `${receipt.purchasedOn}T12:00:00Z`,
            verification: "user_confirmed",
            evidence_id: evidenceFor.get(`receipt:${id}`) ?? null,
            region: receipt.city,
          })),
        ),
      );
    }

    const shared = priced.flatMap(({ line, id }) => {
      if (!line.share) return [];
      const contribution = toContribution(
        { ...line, gtin: line.gtin ? canonicalGtin(line.gtin) : null },
        { retailer: receipt.retailer, city: receipt.city, date: receipt.purchasedOn },
      );
      return contribution ? [{ id, contribution }] : [];
    });
    if (shared.length > 0) {
      ok(await db.from("price_contributions").insert(shared.map(({ id, contribution }) => contributionRow(id, contribution))));
    }
  } catch (error) {
    // Nothing half-saved: the receipt goes, and its lines, prices and queue entries with it.
    await deleteReceipt(receiptId).catch(() => undefined);
    throw error;
  }
  return receiptId;
}

function contributionRow(lineId: string, contribution: Contribution) {
  return {
    receipt_line_id: lineId,
    retailer_id: contribution.retailer,
    city: contribution.city,
    observed_on: contribution.observedOn,
    product_name: contribution.productName,
    gtin: contribution.gtin,
    amount_grosz: contribution.amountGrosz,
    price_per: contribution.per,
  };
}

const lineSchema = z.object({
  id: z.string(),
  position: z.number(),
  raw_text: z.string(),
  name: z.string(),
  gtin: z.string().nullable(),
  quantity: z.coerce.number(),
  unit: z.enum(["szt", "kg"]),
  unit_price_grosz: z.number().nullable(),
  total_grosz: z.number(),
  discount_grosz: z.number(),
  deposit: z.boolean(),
  contribution: z.object({ status: z.enum(["queued", "exported", "withdrawn"]) }).nullable(),
});

const receiptSchema = z.object({
  id: z.string(),
  retailer_id: z.enum(RETAILER_IDS).nullable(),
  store_label: z.string(),
  city: z.string().nullable(),
  purchased_on: isoDateSchema,
  total_grosz: z.number().nullable(),
  created_at: z.string(),
  lines: z.array(lineSchema),
});
export type StoredReceipt = z.infer<typeof receiptSchema>;

export async function listReceipts(limit = 30): Promise<StoredReceipt[]> {
  const result = await getSupabase()
    .from("receipts")
    .select(
      "id, retailer_id, store_label, city, purchased_on, total_grosz, created_at, lines:receipt_lines(id, position, raw_text, name, gtin, quantity, unit, unit_price_grosz, total_grosz, discount_grosz, deposit, contribution:price_contributions(status))",
    )
    .order("purchased_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return rows(receiptSchema, result).map((receipt) => ({
    ...receipt,
    lines: [...receipt.lines].sort((a, b) => a.position - b.position),
  }));
}

/** A receipt and everything that came from it: its lines, their prices, their evidence, any queued share. */
export async function deleteReceipt(id: string): Promise<void> {
  const db = getSupabase();
  const lines = rows(z.object({ id: z.string() }), await db.from("receipt_lines").select("id").eq("receipt_id", id));
  const records = lines.map((line) => `receipt:${line.id}`);
  for (let index = 0; index < records.length; index += 100) {
    ok(
      await db
        .from("grocery_evidence")
        .delete()
        .eq("provider_id", "receipts")
        .in("provider_record_id", records.slice(index, index + 100)),
    );
  }
  // Lines cascade to their prices (receipt_line_id) and queued shares.
  ok(await db.from("receipts").delete().eq("id", id));
}

/** Share one line (anonymized) or take it back. */
export async function setLineShared(lineId: string, share: boolean): Promise<void> {
  const db = getSupabase();
  if (!share) {
    ok(await db.from("price_contributions").update({ status: "withdrawn" }).eq("receipt_line_id", lineId));
    return;
  }
  const line = maybeRow(
    z.object({
      name: z.string(),
      gtin: z.string().nullable(),
      quantity: z.coerce.number(),
      unit: z.enum(["szt", "kg"]),
      total_grosz: z.number(),
      discount_grosz: z.number(),
      deposit: z.boolean(),
      receipt: z.object({ retailer_id: z.enum(RETAILER_IDS).nullable(), city: z.string().nullable(), purchased_on: isoDateSchema }),
    }),
    await db
      .from("receipt_lines")
      .select("name, gtin, quantity, unit, total_grosz, discount_grosz, deposit, receipt:receipts(retailer_id, city, purchased_on)")
      .eq("id", lineId)
      .maybeSingle(),
  );
  if (!line) return;
  const contribution = toContribution(
    { name: line.name, gtin: line.gtin, quantity: line.quantity, unit: line.unit, totalGrosz: line.total_grosz, discountGrosz: line.discount_grosz, deposit: line.deposit },
    { retailer: line.receipt.retailer_id, city: line.receipt.city, date: line.receipt.purchased_on },
  );
  if (!contribution) return;
  ok(
    await db
      .from("price_contributions")
      .upsert({ ...contributionRow(lineId, contribution), status: "queued", consented_at: new Date().toISOString() }, { onConflict: "receipt_line_id" }),
  );
}

const contributionSchema = z.object({
  id: z.string(),
  retailer_id: z.enum(RETAILER_IDS).nullable(),
  city: z.string().nullable(),
  observed_on: isoDateSchema,
  product_name: z.string(),
  gtin: z.string().nullable(),
  amount_grosz: z.number(),
  price_per: z.enum(["pack", "kg"]),
});

/** The lines waiting to be shared, as I agreed to share them. */
export async function listQueuedContributions(): Promise<(Contribution & { id: string })[]> {
  const result = await getSupabase()
    .from("price_contributions")
    .select("id, retailer_id, city, observed_on, product_name, gtin, amount_grosz, price_per")
    .eq("status", "queued")
    .order("observed_on");
  return rows(contributionSchema, result).map((row) => ({
    id: row.id,
    retailer: row.retailer_id,
    city: row.city,
    observedOn: row.observed_on,
    productName: row.product_name,
    gtin: row.gtin,
    amountGrosz: row.amount_grosz,
    per: row.price_per,
  }));
}

export async function markContributionsExported(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  ok(await getSupabase().from("price_contributions").update({ status: "exported" }).in("id", ids));
}
