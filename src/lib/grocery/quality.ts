/**
 * Data-quality checks run on every observation before it is stored, and on
 * a whole provider response. A "reject" issue keeps the row out; a "warn"
 * issue lets it in and is counted in the sync run, so a provider that starts
 * sending odd data shows up on the sources screen. Pure, client-safe.
 */

import { authorizationFor, providerById } from "./providers.ts";
import { compareVariants } from "./matching.ts";
import type { PriceFact } from "./types.ts";
import { convert, unitPrice, type Quantity } from "./units.ts";
import { HISTORY_DAYS } from "./eligibility.ts";

export type QualityCode =
  | "invalid_price"
  | "price_out_of_range"
  | "unit_price_out_of_range"
  | "bad_pack"
  | "currency"
  | "not_poland"
  | "future_date"
  | "expired"
  | "stale"
  | "missing_evidence"
  | "unverified_provider"
  | "impossible_unit"
  | "variant_mismatch"
  | "price_jump"
  | "duplicate"
  | "broken_response";

export type QualityIssue = { code: QualityCode; severity: "reject" | "warn"; message: string };

/** Above this a grocery pack price is a typo or not a grocery (a TV in a leaflet). */
export const MAX_PACK_GROSZ = 200_000;
/** Above this per kilo or litre: saffron and caviar aside, a decimal slipped. */
export const MAX_UNIT_GROSZ = 150_000;
/** A new price this far from the median of earlier ones is flagged (not dropped). */
export const JUMP_RATIO = 0.6;

export type QualityContext = {
  today: string;
  /** Earlier prices (grosz) of the same product at the same retailer, for jumps. */
  previous?: number[];
  /** Keys already seen in this import, for duplicates. */
  seen?: Set<string>;
  /** What the observation is meant to be, to catch variant mix-ups ("twaróg chudy"). */
  expectedName?: string;
  /** The amount it must price, to catch packs in the wrong unit. */
  needed?: Quantity;
};

export function duplicateKey(fact: PriceFact): string {
  return [
    fact.providerId,
    fact.retailer,
    fact.productName.toLowerCase(),
    fact.region.city?.toLowerCase() ?? "",
    fact.observedAt.slice(0, 10),
    fact.amountGrosz,
  ].join("|");
}

export function checkFact(fact: PriceFact, ctx: QualityContext): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const reject = (code: QualityCode, message: string) => issues.push({ code, severity: "reject", message });
  const warn = (code: QualityCode, message: string) => issues.push({ code, severity: "warn", message });

  if (!Number.isInteger(fact.amountGrosz) || fact.amountGrosz <= 0) reject("invalid_price", "cena nie jest dodatnią kwotą");
  else if (fact.amountGrosz > MAX_PACK_GROSZ) reject("price_out_of_range", "cena za opakowanie poza zakresem");
  if (fact.currency !== "PLN") reject("currency", `waluta ${fact.currency}`);
  if (fact.pack && !(fact.pack.amount > 0)) reject("bad_pack", "opakowanie bez dodatniej ilości");
  if (fact.region.city === null && !fact.region.national && fact.region.channel === "store") {
    warn("not_poland", "sklep bez miasta: nie da się sprawdzić, czy jest w Polsce");
  }

  const day = fact.observedAt.slice(0, 10);
  if (day > ctx.today) reject("future_date", "data obserwacji w przyszłości");
  if (fact.validTo !== null && fact.validTo < ctx.today) warn("expired", "oferta już nieważna");
  const age = (Date.parse(`${ctx.today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000;
  if (age > HISTORY_DAYS) warn("stale", `obserwacja sprzed ${Math.round(age)} dni`);

  if (!fact.evidence || (!fact.evidence.url && !fact.evidence.recordId)) warn("missing_evidence", "brak dowodu źródła");
  const provider = fact.providerId ? providerById(fact.providerId) : null;
  if (!provider) reject("unverified_provider", "nieznane źródło");
  else if (authorizationFor(provider) === "unverified") warn("unverified_provider", `${provider.name}: brak potwierdzonej zgody`);
  else if (authorizationFor(provider) === "not_configured") reject("unverified_provider", `${provider.name}: nie skonfigurowane`);

  if (fact.pack && fact.pack.amount > 0 && fact.amountGrosz > 0) {
    const perUnit = unitPrice(fact.amountGrosz, fact.pack);
    if (perUnit && perUnit.per !== "szt" && perUnit.grosz > MAX_UNIT_GROSZ) {
      warn("unit_price_out_of_range", "cena za kilogram/litr poza zakresem");
    }
  }
  if (ctx.needed && fact.pack && !convert(fact.pack, ctx.needed.unit)) {
    reject("impossible_unit", `opakowanie w ${fact.pack.unit}, potrzebne ${ctx.needed.unit}`);
  }
  if (ctx.expectedName) {
    const { conflicts } = compareVariants(ctx.expectedName, fact.productName);
    if (conflicts.length > 0) warn("variant_mismatch", conflicts.join("; "));
  }

  if (ctx.previous && ctx.previous.length > 0 && fact.amountGrosz > 0) {
    const sorted = [...ctx.previous].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median > 0 && Math.abs(fact.amountGrosz - median) / median > JUMP_RATIO) {
      warn("price_jump", `cena ${fact.amountGrosz} gr przy wcześniejszych ok. ${median} gr`);
    }
  }
  if (ctx.seen) {
    const key = duplicateKey(fact);
    if (ctx.seen.has(key)) reject("duplicate", "ta sama obserwacja drugi raz");
    else ctx.seen.add(key);
  }
  return issues;
}

/** A response where most rows could not be read is a broken source, not a quiet week. */
export function responseIssues(counts: { fetched: number; unreadable: number }): QualityIssue[] {
  if (counts.fetched > 0 && counts.unreadable / counts.fetched > 0.5) {
    return [{ code: "broken_response", severity: "reject", message: `${counts.unreadable} z ${counts.fetched} rekordów nieczytelnych` }];
  }
  return [];
}

/** Issue counts by code, for the sync run's `issues`. */
export function countIssues(issues: QualityIssue[][]): Partial<Record<QualityCode, number>> {
  const counts: Partial<Record<QualityCode, number>> = {};
  for (const list of issues) for (const issue of list) counts[issue.code] = (counts[issue.code] ?? 0) + 1;
  return counts;
}

export const isRejected = (issues: QualityIssue[]) => issues.some((issue) => issue.severity === "reject");
