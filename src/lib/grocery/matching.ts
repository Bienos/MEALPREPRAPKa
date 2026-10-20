/**
 * Is this product the shopping-list item? A graded answer instead of yes/no,
 * so a near miss is never priced as if it were the thing. Pure, client-safe;
 * no AI.
 *
 * Tiers, best first:
 *  1. gtin         — the same barcode as the item (a product pinned from a receipt);
 *  2. listing      — I confirmed this retailer product ("Tak");
 *  3. attributes   — the keyword rule fits and every attribute the item names
 *                    (fat, rice type, egg size, cooked/frozen, …) is stated
 *                    and equal, and the pack is read, not assumed;
 *  4. category     — the rule fits, nothing conflicts, but something the item
 *                    names is not stated (or the pack is assumed);
 *  5. substitution — the rule fits but an attribute differs ("twaróg tłusty"
 *                    for "twaróg chudy"): shown as a suggestion, never priced
 *                    until approved;
 *  6. none.
 *
 * Similar names are not identical products: only tiers 1–3 may decide the
 * strict (verified) basket, 1–4 the labelled reference totals.
 */

import type { Unit } from "../meals/ingredients.ts";
import { categorize } from "../meals/ingredients.ts";
import { ruleAccepts } from "../prices/match.ts";
import { canonicalGtin, isRestrictedGtin } from "./gtin.ts";
import { fatLevelOf, familyOf, fold, variantOf, withPolish, type Variant } from "./normalize.ts";
import { convert, type Quantity } from "./units.ts";

export type MatchTier = "gtin" | "listing" | "attributes" | "category" | "substitution" | "none";

export type Need = {
  name: string;
  unit: Unit | null;
  /** A barcode the item is pinned to (from a receipt line). */
  gtin?: string | null;
};

export type Candidate = {
  name: string;
  brand?: string | null;
  gtin?: string | null;
  pack: Quantity | null;
  /** The pack was assumed (a leaflet price that names none). */
  packAssumed?: boolean;
  /** I said "Tak" to this product for this item. */
  confirmed?: boolean;
  /** I said "Nie". */
  rejected?: boolean;
};

export type MatchResult = {
  tier: MatchTier;
  /** Attributes that differ, in Polish ("tłuszcz: chudy ≠ tłusty"). */
  conflicts: string[];
  /** Attributes the item names that the product does not state. */
  unknown: string[];
  /** A substitution: needs my approval before it can price the item. */
  needsApproval: boolean;
};

export const TIER_LABELS: Record<MatchTier, string> = {
  gtin: "ten sam kod EAN",
  listing: "potwierdzony produkt",
  attributes: "zgodne cechy",
  category: "ten rodzaj produktu",
  substitution: "zamiennik, do zatwierdzenia",
  none: "nie pasuje",
};

/** Tiers good enough for the verified basket, and for the labelled reference totals. */
export const STRICT_TIERS = new Set<MatchTier>(["gtin", "listing", "attributes"]);
export const REFERENCE_TIERS = new Set<MatchTier>(["gtin", "listing", "attributes", "category"]);

const FAT_WORDS = { low: "chudy/light", mid: "półtłusty", full: "tłusty" } as const;

function none(reason: string): MatchResult {
  return { tier: "none", conflicts: [reason], unknown: [], needsApproval: false };
}

/** Brands I never want suggested, folded ("Pilos" -> "pilos"). */
export function isExcludedBrand(candidate: Pick<Candidate, "name" | "brand">, excluded: readonly string[]): boolean {
  if (excluded.length === 0) return false;
  const text = fold(`${candidate.brand ?? ""} ${candidate.name}`);
  return excluded.some((brand) => {
    const word = fold(brand).trim();
    return word.length > 1 && new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);
  });
}

export function matchCandidate(
  need: Need,
  candidate: Candidate,
  options: { excludedBrands?: readonly string[] } = {},
): MatchResult {
  if (candidate.rejected) return none("odrzucony przez Ciebie");
  if (isExcludedBrand(candidate, options.excludedBrands ?? [])) return none("marka wykluczona w ustawieniach");

  // A pack in pieces cannot price grams (and the other way round): never this item's price.
  if (candidate.pack && need.unit && !convert(candidate.pack, need.unit)) {
    return none("opakowanie w innej jednostce");
  }

  const needGtin = need.gtin ? canonicalGtin(need.gtin) : null;
  const candidateGtin = candidate.gtin ? canonicalGtin(candidate.gtin) : null;
  // In-store codes (weighed goods, a chain's own short codes) mean nothing outside that chain.
  if (needGtin && candidateGtin && needGtin === candidateGtin && !isRestrictedGtin(needGtin)) {
    return { tier: "gtin", conflicts: [], unknown: [], needsApproval: false };
  }
  if (candidate.confirmed) return { tier: "listing", conflicts: [], unknown: [], needsApproval: false };

  if (!ruleAccepts(need.name, withPolish(candidate.name))) return none("inny produkt");

  const { conflicts, unknown } = compareVariants(need.name, candidate.name);
  if (conflicts.length > 0) return { tier: "substitution", conflicts, unknown, needsApproval: true };
  if (!candidate.pack || candidate.packAssumed) unknown.push("opakowanie nie podane");
  return {
    tier: unknown.length === 0 ? "attributes" : "category",
    conflicts: [],
    unknown,
    needsApproval: false,
  };
}

/**
 * What the item names, checked against what the product states. Only the
 * item's own attributes are checked: "ryż" accepts any rice, "ryż basmati"
 * only basmati.
 */
export function compareVariants(needName: string, productName: string): { conflicts: string[]; unknown: string[] } {
  const need = variantOf(needName);
  const product = variantOf(productName);
  const conflicts: string[] = [];
  const unknown: string[] = [];
  const family = familyOf(withPolish(needName)) ?? familyOf(withPolish(productName));

  if (need.fat) {
    const result = compareFat(need.fat, product.fat, family);
    if (result === "unknown") unknown.push("zawartość tłuszczu");
    else if (result !== "same") conflicts.push(`tłuszcz: ${result}`);
  }
  compareSimple("ryż", need.rice, product.rice, conflicts, unknown);
  compareSimple("rozmiar jaj", need.eggSize, product.eggSize, conflicts, unknown);
  if (need.state) {
    if (!product.state) unknown.push(stateLabel(need.state));
    else if (product.state !== need.state) conflicts.push(`${stateLabel(product.state)} zamiast: ${stateLabel(need.state)}`);
  } else if ((product.state === "cooked" || product.state === "smoked") && rawIngredient(needName)) {
    conflicts.push(`${stateLabel(product.state)}, a potrzebny surowy`);
  }
  for (const flag of ["wholegrain", "lactoseFree", "organic", "extraVirgin"] as const) {
    if (need[flag] && !product[flag]) unknown.push(FLAG_LABELS[flag]);
  }
  return { conflicts, unknown };
}

const FLAG_LABELS = {
  wholegrain: "pełnoziarnisty",
  lactoseFree: "bez laktozy",
  organic: "bio",
  extraVirgin: "extra virgin",
} as const;

function stateLabel(state: NonNullable<Variant["state"]>): string {
  return { cooked: "gotowany/pieczony", smoked: "wędzony", frozen: "mrożony", canned: "w puszce/słoiku", dried: "suszony" }[state];
}

/** Raw meat or fish on the list (not a cold cut like turkey ham, not tinned tuna). */
function rawIngredient(needName: string): boolean {
  const name = fold(needName);
  return categorize(needName) === "meat" && !/szynk|tunczyk|gotow|pieczon/.test(name);
}

function compareSimple<T extends string>(label: string, need: T | undefined, product: T | undefined, conflicts: string[], unknown: string[]) {
  if (!need) return;
  if (!product) unknown.push(label);
  else if (product !== need) conflicts.push(`${label}: ${product} zamiast ${need}`);
}

function compareFat(
  need: NonNullable<Variant["fat"]>,
  product: Variant["fat"],
  family: ReturnType<typeof familyOf>,
): "same" | "unknown" | string {
  if (!product) return "unknown";
  // Percent against percent: half a point either way is the same label.
  if (need.percent !== undefined && product.percent !== undefined) {
    return Math.abs(need.percent - product.percent) <= 0.5 ? "same" : `${fmt(product.percent)}% zamiast ${fmt(need.percent)}%`;
  }
  const needLevel = need.level ?? (need.percent !== undefined ? fatLevelOf(need.percent, family) : null);
  const productLevel = product.level ?? (product.percent !== undefined ? fatLevelOf(product.percent, family) : null);
  if (!needLevel || !productLevel) return "unknown";
  return needLevel === productLevel ? "same" : `${FAT_WORDS[productLevel]} zamiast ${FAT_WORDS[needLevel]}`;
}

function fmt(value: number): string {
  return String(value).replace(".", ",");
}

/** The best tier first, for sorting candidates. */
export function tierRank(tier: MatchTier): number {
  return ["gtin", "listing", "attributes", "category", "substitution", "none"].indexOf(tier);
}
