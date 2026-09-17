/**
 * Normalized meal library model. Pure types and tiny helpers only: this file is
 * imported by client components, so it must not touch server-only modules.
 */

export type Variant = "DT" | "DNT" | null;

export type MealVariant = {
  /** Stable: `${mealKey}:dt`, `${mealKey}:dnt` or `${mealKey}:base`. */
  key: string;
  mealKey: string;
  name: string;
  category: string;
  variant: Variant;
  /** Raw text from the sheet. Deliberately not parsed into structured ingredients. */
  ingredients: string;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  prepTime: string | null;
  batch: string | null;
  fridgeLife: string | null;
  /** null when the sheet cell is empty or unrecognised. */
  freezable: boolean | null;
  /** 1-based row in the sheet, for diagnostics. */
  row: number;
};

export type Meal = {
  /** Stable slug of the dish name. Planning stores this as `meal_key`. */
  key: string;
  name: string;
  category: string;
  /** DT and DNT rows of the same dish are grouped here; neutral dishes have one `null` variant. */
  variants: MealVariant[];
};

export type RowIssue = { row: number; name: string | null; problems: string[] };

export type Field =
  | "category"
  | "name"
  | "variant"
  | "ingredients"
  | "kcal"
  | "protein"
  | "fat"
  | "carbs"
  | "prepTime"
  | "batch"
  | "fridgeLife"
  | "freezable";

export type MealLibrary = {
  meals: Meal[];
  /** Categories in order of first appearance in the sheet. */
  categories: string[];
  /** Rows that were skipped or flagged. Shown in the UI instead of failing silently. */
  issues: RowIssue[];
  /** Detected column mapping: 0-based column index per field, null when absent. */
  columns: Record<Field, number | null>;
};

export type MealLibrarySource = "sheets" | "stale" | "fixture" | "none";

export type MealLibrarySnapshot = {
  library: MealLibrary;
  source: MealLibrarySource;
  fetchedAt: string | null;
  sheetTitle: string | null;
  error: string | null;
};

export const VARIANT_ORDER: Variant[] = ["DT", "DNT", null];

export function variantLabel(variant: Variant): string {
  return variant ?? "Uniwersalne";
}

/** The variant to show first: DT, then DNT, then neutral. */
export function primaryVariant(meal: Meal): MealVariant {
  const sorted = [...meal.variants].sort(
    (a, b) => VARIANT_ORDER.indexOf(a.variant) - VARIANT_ORDER.indexOf(b.variant),
  );
  return sorted[0];
}

/** "59 B · 17 T · 100 W", rounded to whole grams. */
export function macroSummary(v: Pick<MealVariant, "protein_g" | "fat_g" | "carbs_g">): string {
  return `${Math.round(v.protein_g)} B · ${Math.round(v.fat_g)} T · ${Math.round(v.carbs_g)} W`;
}

/** Polish plural for "posiłek". */
export function pluralMeals(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (count === 1) return "1 posiłek";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} posiłki`;
  return `${count} posiłków`;
}

/** Finds one variant of one meal by the keys stored in Supabase. */
export function findMealVariant(
  meals: Meal[],
  mealKey: string,
  variant: Variant,
): MealVariant | undefined {
  const meal = meals.find((candidate) => candidate.key === mealKey);
  if (!meal) return undefined;
  return (
    meal.variants.find((candidate) => candidate.variant === variant) ??
    // The sheet may have dropped that variant; fall back to any variant of the dish.
    meal.variants[0]
  );
}

/** Variants usable on a given day: the matching DT/DNT one, plus neutral meals. */
export function variantsForDayType(meals: Meal[], dayType: "DT" | "DNT"): MealVariant[] {
  return meals.flatMap((meal) =>
    meal.variants.filter((variant) => variant.variant === dayType || variant.variant === null),
  );
}
