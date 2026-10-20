/**
 * Ingredient text from the sheet is semi-structured:
 *   "Kurczak 200 g SUROWY; ryż 110 g SUCHY; warzywa 200 g; oliwa 10 g"
 *
 * Against the real library this parses ~99% of fragments, so aggregation is
 * worth doing. Anything it cannot read is kept as raw text with no quantity
 * rather than guessed at — the shopping list shows it without an amount.
 *
 * Isolated on purpose: this is the only place that interprets ingredient text,
 * so it can be improved (or replaced by structured sheet columns) on its own.
 */

export type Unit = "g" | "ml" | "szt";

export type ParsedIngredient = {
  /** Display name, trimmed and lower-cased for matching. */
  name: string;
  /** null when the fragment carries no readable amount (spices and similar). */
  quantity: number | null;
  unit: Unit | null;
  raw: string;
};

export const SHOPPING_CATEGORIES = ["meat", "dairy", "carbs", "vegetables", "fruit", "other"] as const;
export type ShoppingCategory = (typeof SHOPPING_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ShoppingCategory, string> = {
  meat: "MIĘSO I RYBY",
  dairy: "NABIAŁ I JAJA",
  carbs: "WĘGLOWODANY",
  vegetables: "WARZYWA",
  fruit: "OWOCE",
  other: "INNE",
};

/** Keyword → category. First match wins, so longer keywords come first. */
const CATEGORY_KEYWORDS: [string, ShoppingCategory][] = [
  ["pierś z kurczaka", "meat"],
  ["szynka z indyka", "meat"],
  ["kurczak", "meat"],
  ["indyk", "meat"],
  ["wołowina", "meat"],
  ["tuńczyk", "meat"],
  ["łosoś", "meat"],
  ["białka jaj", "dairy"],
  ["jajka", "dairy"],
  ["jajko", "dairy"],
  ["skyr", "dairy"],
  ["jogurt", "dairy"],
  ["twaróg", "dairy"],
  ["serek wiejski", "dairy"],
  ["mozzarella", "dairy"],
  ["feta", "dairy"],
  ["ser ", "dairy"],
  ["ser", "dairy"],
  ["mleko kokosowe", "other"],
  ["mleko", "dairy"],
  ["płatki owsiane", "carbs"],
  ["płatki", "carbs"],
  ["pieczywo", "carbs"],
  ["chleb", "carbs"],
  ["tortilla", "carbs"],
  ["tortille", "carbs"],
  ["makaron", "carbs"],
  ["ryż", "carbs"],
  ["orzo", "carbs"],
  ["kasza", "carbs"],
  ["ziemniaki", "carbs"],
  ["fasola", "carbs"],
  ["warzywa", "vegetables"],
  ["ogórek", "vegetables"],
  ["cebula", "vegetables"],
  ["papryka", "vegetables"],
  ["pieczarki", "vegetables"],
  ["passata", "vegetables"],
  ["salsa", "vegetables"],
  ["kukurydza", "vegetables"],
  ["pomidor", "vegetables"],
  ["owoce mrożone", "fruit"],
  ["owoce", "fruit"],
  ["banan", "fruit"],
  ["jabłko", "fruit"],
];

export function categorize(name: string): ShoppingCategory {
  const lower = name.toLowerCase();
  for (const [keyword, category] of CATEGORY_KEYWORDS) {
    if (lower.includes(keyword)) return category;
  }
  return "other";
}

const UNIT_ALIASES: Record<string, { unit: Unit; factor: number }> = {
  g: { unit: "g", factor: 1 },
  kg: { unit: "g", factor: 1000 },
  ml: { unit: "ml", factor: 1 },
  l: { unit: "ml", factor: 1000 },
  szt: { unit: "szt", factor: 1 },
  "szt.": { unit: "szt", factor: 1 },
};

// "Kurczak 200 g SUROWY" — the amount is the LAST number+unit, so "Wołowina 5% 200 g" works.
// Groups: 1 name, 2 quantity, 3 unit.
const TRAILING_AMOUNT = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|szt\.?)(?![a-ząćęłńóśźż])(?:.*)$/i;
// "3 jajka" — a leading count, common for eggs. Groups: 1 quantity, 2 name.
const LEADING_COUNT = /^(\d+)\s+([a-ząćęłńóśźż].*)$/i;

/** An egg weighs about 60 g: the sheet's own "3 jajka (~180 g)". */
const EGG_GRAMS = 60;
// "2 jajka 120 g": the count is the amount, the grams only a note.
const COUNTED_EGGS = /^(\d+)\s+jaj(?:ka|ko|ek|a)\b/i;
const EGGS = /^jaj(?:ka|ko|ek|a)$/i;

/**
 * One fragment of the sheet's ingredient text. Eggs are always pieces, however
 * the sheet wrote them ("3 jajka", "2 jajka 120 g", "Jajka 100 g"), so one
 * list line adds them up.
 */
export function parseIngredient(fragment: string): ParsedIngredient {
  const parsed = parseAmount(fragment);
  if (parsed.unit === "g" && parsed.quantity !== null && EGGS.test(parsed.name)) {
    return { ...parsed, quantity: parsed.quantity / EGG_GRAMS, unit: "szt" };
  }
  return parsed;
}

function parseAmount(fragment: string): ParsedIngredient {
  const raw = fragment.trim();
  // Parentheticals are notes like "(~180 g)", never the amount to buy.
  const cleaned = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const counted = COUNTED_EGGS.exec(cleaned);
  if (counted) return { name: "jajka", quantity: Number(counted[1]), unit: "szt", raw };

  const trailing = TRAILING_AMOUNT.exec(cleaned);
  if (trailing) {
    const [, name, qty, unit] = trailing;
    const alias = UNIT_ALIASES[unit.toLowerCase()];
    return {
      name: normalizeName(name),
      quantity: Number(qty.replace(",", ".")) * alias.factor,
      unit: alias.unit,
      raw,
    };
  }

  const leading = LEADING_COUNT.exec(cleaned);
  if (leading) {
    const [, qty, name] = leading;
    return { name: normalizeName(name), quantity: Number(qty), unit: "szt", raw };
  }

  return { name: normalizeName(cleaned), quantity: null, unit: null, raw };
}

/** Drops preparation notes so "Kurczak SUROWY" and "Kurczak" aggregate together. */
export function normalizeName(name: string): string {
  return name
    .replace(/\b(surowy|surowa|surowe|suchy|sucha|suche|odsączony|odsączona|mrożona|mrożone)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[.,;]+$/, "")
    .trim()
    .toLowerCase();
}

export function parseIngredients(text: string): ParsedIngredient[] {
  return text
    .split(/[;\n]/)
    .map((fragment) => fragment.trim())
    .filter(Boolean)
    .map(parseIngredient);
}

export type AggregatedIngredient = {
  name: string;
  category: ShoppingCategory;
  quantity: number | null;
  unit: Unit | null;
};

/**
 * Sums the same ingredient across every meal and portion.
 * Fragments without an amount survive as a single entry with no quantity.
 */
/**
 * What the sheet's "warzywa" stands for on the shopping list: these five, the
 * amount split evenly (to 10 g), so each has a price at a shop.
 */
export const VEGETABLE_MIX = ["pomidor", "ogórek", "cebula", "papryka", "pieczarki"];
const GENERIC_VEGETABLES = /^warzywa(\s*\/\s*mieszanka)?$/;
/** The sheet's generic fruit is bought frozen (strawberries, blueberries or raspberries, whichever is cheapest). */
const GENERIC_FRUIT = /^owoce( jagodowe| lesne| leśne| mix)?$/;
export const FROZEN_FRUIT = "owoce mrożone";

/** "warzywa 2200 g" as five named vegetables of 440 g; anything else as it is. */
function expandVegetables(parsed: ParsedIngredient): ParsedIngredient[] {
  if (GENERIC_FRUIT.test(parsed.name) && parsed.unit === "g" && parsed.quantity !== null) {
    return [{ ...parsed, name: FROZEN_FRUIT }];
  }
  if (!GENERIC_VEGETABLES.test(parsed.name) || parsed.unit !== "g" || parsed.quantity === null) return [parsed];
  const each = parsed.quantity / VEGETABLE_MIX.length;
  return VEGETABLE_MIX.map((name) => ({ ...parsed, name, quantity: each }));
}

export function aggregateIngredients(entries: { text: string; portions: number }[]): AggregatedIngredient[] {
  const totals = new Map<string, AggregatedIngredient>();

  for (const entry of entries) {
    for (const parsed of parseIngredients(entry.text).flatMap(expandVegetables)) {
      if (!parsed.name) continue;
      const key = `${parsed.name}|${parsed.unit ?? ""}`;
      const existing = totals.get(key);
      const amount = parsed.quantity === null ? null : parsed.quantity * entry.portions;

      if (!existing) {
        totals.set(key, {
          name: parsed.name,
          category: categorize(parsed.name),
          quantity: amount,
          unit: parsed.unit,
        });
      } else if (existing.quantity !== null && amount !== null) {
        existing.quantity += amount;
      }
    }
  }

  for (const total of totals.values()) {
    // Pieces come whole: 11,7 eggs means 12.
    if (total.unit === "szt" && total.quantity !== null) total.quantity = Math.ceil(total.quantity - 1e-9);
    // The vegetable mix is split evenly, to 10 g: 676 g is 680 g.
    else if (VEGETABLE_MIX.includes(total.name) && total.unit === "g" && total.quantity !== null) {
      total.quantity = Math.ceil(total.quantity / 10 - 1e-9) * 10;
    }
  }

  return [...totals.values()].sort(
    (a, b) =>
      SHOPPING_CATEGORIES.indexOf(a.category) - SHOPPING_CATEGORIES.indexOf(b.category) ||
      a.name.localeCompare(b.name, "pl"),
  );
}

/** "1,6 kg", "620 g", "3 szt" — Polish decimal comma, kg above 1000 g. */
export function formatAmount(quantity: number | null, unit: Unit | null): string | null {
  if (quantity === null || unit === null) return null;
  if ((unit === "g" || unit === "ml") && quantity >= 1000) {
    const large = Math.round((quantity / 1000) * 100) / 100;
    return `${String(large).replace(".", ",")} ${unit === "g" ? "kg" : "l"}`;
  }
  const rounded = Math.round(quantity * 10) / 10;
  return `${String(rounded).replace(".", ",")} ${unit}`;
}
