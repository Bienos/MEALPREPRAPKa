/**
 * The format a licensed data partner (a retailer, Blix, an aggregator)
 * delivers offers in, as CSV or JSON, and its validation. Onboarding a
 * partner is: a provider entry in providers.ts with its contract as
 * evidence and `authorization` "granted", a key prefix, and a sync that
 * feeds its file through `parseLicensedFeed`. The price engine does not
 * change.
 *
 * Nothing is imported for a provider that is not granted: the parser
 * refuses before reading a row. Every row is checked whole; a bad row is
 * rejected with its reason and never half-imported.
 */

import { z } from "zod";

import { canonicalGtin } from "../gtin.ts";
import { authorizationFor, type Provider } from "../providers.ts";
import { RETAILER_IDS } from "../retailers.ts";
import { LOYALTY_PROGRAMS, type PriceFact } from "../types.ts";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data RRRR-MM-DD");

/** CSV booleans: "true"/"false", "1"/"0", "tak"/"nie". (`z.coerce.boolean()` would read "false" as true.) */
const csvBoolean = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (/^(true|1|tak|yes)$/i.test(value.trim())) return true;
  if (/^(false|0|nie|no)$/i.test(value.trim())) return false;
  return value;
}, z.boolean());

export const licensedOfferSchema = z
  .object({
    retailer: z.enum(RETAILER_IDS),
    sku: z.string().trim().min(1).max(100),
    gtin: z.string().trim().nullish(),
    name: z.string().trim().min(1).max(300),
    pack_quantity: z.coerce.number().positive().nullish(),
    pack_unit: z.enum(["g", "ml", "szt"]).nullish(),
    loose: csvBoolean.default(false),
    price_grosz: z.coerce.number().int().positive(),
    currency: z.literal("PLN"),
    price_type: z.enum(["regular", "promotion", "loyalty", "multibuy"]),
    regular_price_grosz: z.coerce.number().int().positive().nullish(),
    valid_from: isoDate,
    valid_to: isoDate.nullish(),
    channel: z.enum(["store", "online"]),
    /** "PL" for a national price, else the town. */
    region: z.string().trim().min(2).max(60),
    url: z.url().nullish(),
    in_stock: csvBoolean.nullish(),
    loyalty_program: z.enum(LOYALTY_PROGRAMS).nullish(),
    min_quantity: z.coerce.number().int().min(1).default(1),
    conditions_text: z.string().default(""),
    observed_at: z.iso.datetime({ offset: true }),
  })
  .refine((row) => (row.pack_quantity == null) === (row.pack_unit == null), "pack_quantity i pack_unit razem")
  .refine((row) => !row.valid_to || row.valid_to >= row.valid_from, "valid_to przed valid_from")
  .refine((row) => !row.gtin || canonicalGtin(row.gtin) !== null, "nieprawidłowy GTIN")
  .refine((row) => row.price_type !== "loyalty" || row.loyalty_program != null, "cena lojalnościowa bez programu");

export type LicensedOffer = z.infer<typeof licensedOfferSchema>;

export type LicensedImport = {
  facts: { recordId: string; gtin: string | null; sku: string; fact: PriceFact }[];
  rejected: { row: number; reason: string }[];
};

/** A minimal CSV reader for partner files: a header row, comma separated, double-quoted fields. */
export function parseCsvRows(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((one) => one.some((cell) => cell.trim() !== ""));
  if (!header) return [];
  return body.map((cells) =>
    Object.fromEntries(
      header.map((name, index) => {
        const value = (cells[index] ?? "").trim();
        return [name.trim(), value === "" ? undefined : value];
      }),
    ),
  ) as Record<string, string>[];
}

/**
 * A partner file (CSV text or a JSON array) as price facts. Refuses unless
 * the provider's authorization for this deployment is "granted".
 */
export function parseLicensedFeed(input: string | unknown[], provider: Provider): LicensedImport {
  if (authorizationFor(provider) !== "granted") {
    throw new Error(`${provider.name}: brak licencji w rejestrze źródeł, plik nie został wczytany.`);
  }
  const prefix = provider.keyPrefixes[0];
  if (!prefix) throw new Error(`${provider.name}: brak prefiksu kluczy w rejestrze źródeł.`);
  const rows = typeof input === "string" ? parseCsvRows(input) : input;
  const result: LicensedImport = { facts: [], rejected: [] };
  rows.forEach((raw, index) => {
    const parsed = licensedOfferSchema.safeParse(raw);
    if (!parsed.success) {
      result.rejected.push({ row: index + 1, reason: parsed.error.issues.map((issue) => `${issue.path.join(".") || "wiersz"}: ${issue.message}`).join("; ") });
      return;
    }
    const offer = parsed.data;
    const national = offer.region.toUpperCase() === "PL";
    result.facts.push({
      recordId: `${prefix}${offer.retailer}:${offer.sku}:${offer.valid_from}:${offer.price_type}`,
      gtin: offer.gtin ? canonicalGtin(offer.gtin) : null,
      sku: offer.sku,
      fact: {
        providerId: provider.id,
        retailer: offer.retailer,
        productName: offer.name,
        amountGrosz: offer.price_grosz,
        currency: offer.currency,
        per: "pack",
        pack: offer.pack_quantity != null && offer.pack_unit ? { amount: offer.pack_quantity, unit: offer.pack_unit } : null,
        loose: offer.loose,
        priceType: offer.price_type,
        regularGrosz: offer.regular_price_grosz ?? null,
        kind: offer.price_type === "regular" ? "current_offer" : "published_promotion",
        observedAt: offer.observed_at,
        validFrom: offer.valid_from,
        validTo: offer.valid_to ?? null,
        conditions: {
          loyaltyProgram: offer.loyalty_program ?? null,
          appOnly: offer.price_type === "loyalty",
          minQuantity: offer.min_quantity,
          multibuy: offer.price_type === "multibuy" ? offer.conditions_text || "multi-buy" : null,
          quantityLimit: null,
          depositGrosz: 0,
          text: offer.conditions_text,
        },
        evidence: { type: "feed_record", url: offer.url ?? null, recordId: `${offer.retailer}:${offer.sku}` },
        region: { channel: offer.channel, national, city: national ? null : offer.region, deliveryTowns: offer.channel === "online" && !national ? [offer.region] : null },
        availability: offer.in_stock == null ? "unknown" : offer.in_stock ? "in_stock" : "out_of_stock",
        derived: false,
      },
    });
  });
  return result;
}
