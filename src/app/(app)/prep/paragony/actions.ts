"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { todayIso } from "@/lib/date";
import {
  deleteReceipt,
  DuplicateReceiptError,
  listQueuedContributions,
  markContributionsExported,
  saveReceipt,
  setLineShared,
} from "@/lib/db/receipts";
import { canonicalGtin } from "@/lib/grocery/gtin";
import { contributionsCsv } from "@/lib/grocery/receipts";
import { RETAILER_IDS } from "@/lib/grocery/retailers";

const lineSchema = z.object({
  raw: z.string().max(300),
  name: z.string().trim().min(1).max(120),
  gtin: z
    .string()
    .trim()
    .max(20)
    .nullable()
    .refine((value) => !value || canonicalGtin(value) !== null, "Nieprawidłowy kod EAN"),
  quantity: z.number().positive().max(1000),
  unit: z.enum(["szt", "kg"]),
  unitPriceGrosz: z.number().int().positive().max(1_000_000).nullable(),
  totalGrosz: z.number().int().min(0).max(1_000_000),
  discountGrosz: z.number().int().min(0).max(1_000_000),
  deposit: z.boolean(),
  share: z.boolean(),
});

const receiptSchema = z.object({
  retailer: z.enum(RETAILER_IDS).nullable(),
  storeLabel: z.string().trim().max(80),
  city: z.string().trim().min(2).max(60).nullable(),
  purchasedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalGrosz: z.number().int().min(0).max(10_000_000).nullable(),
  text: z.string().max(20_000),
  lines: z.array(lineSchema).min(1).max(200),
});

export type SaveReceiptResult = { ok: true } | { ok: false; message: string };

/** [ Zapisz prywatnie ] the receipt I reviewed. Nothing is shared unless a line says so. */
export async function saveReceiptAction(input: z.input<typeof receiptSchema>): Promise<SaveReceiptResult> {
  const parsed = receiptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Sprawdź pola paragonu." };
  }
  if (parsed.data.purchasedOn > todayIso()) return { ok: false, message: "Data zakupu jest w przyszłości." };
  try {
    await saveReceipt(parsed.data);
  } catch (error) {
    if (error instanceof DuplicateReceiptError) return { ok: false, message: error.message };
    console.error("[receipts] save failed:", error);
    return { ok: false, message: "Nie udało się zapisać paragonu." };
  }
  refresh();
  return { ok: true };
}

/** Deletes a receipt with its lines, prices and anything queued to share. */
export async function deleteReceiptAction(id: string): Promise<void> {
  await deleteReceipt(z.uuid().parse(id));
  refresh();
}

/** Share one line anonymized (chain, town, day, product, price), or take it back. */
export async function setLineSharedAction(lineId: string, share: boolean): Promise<void> {
  await setLineShared(z.uuid().parse(lineId), z.boolean().parse(share));
  refresh();
}

/** The queue as CSV for me to download and upload myself; nothing is sent anywhere. */
export async function exportContributionsAction(): Promise<{ csv: string; count: number }> {
  const queued = await listQueuedContributions();
  const csv = contributionsCsv(queued);
  await markContributionsExported(queued.map((one) => one.id));
  refresh();
  return { csv, count: queued.length };
}
