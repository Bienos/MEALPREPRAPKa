import { z } from "zod";

import type { Field, Meal, MealLibrary, MealVariant, RowIssue, Variant } from "./types.ts";

/* ----------------------------------------------------------------------------
 * Header resolution: columns are found by normalized name, never by position.
 * -------------------------------------------------------------------------- */

const REQUIRED: Field[] = ["name", "kcal", "protein", "fat", "carbs"];

/** Accepted header spellings per field, already normalized (see `normalizeHeader`). */
const ALIASES: Record<Field, string[]> = {
  category: ["typ", "kategoria", "rodzaj", "category", "type"],
  name: ["danie", "nazwa", "nazwa dania", "posilek", "meal", "name", "dish"],
  variant: ["wersja", "wariant", "variant", "dt dnt", "dzien", "day"],
  ingredients: ["skladniki", "skladniki i gramatura", "sklad", "ingredients"],
  kcal: ["kcal", "kalorie", "energia", "calories", "energy"],
  protein: ["b", "b g", "bialko", "bialko g", "p", "protein", "protein g"],
  fat: ["t", "t g", "tluszcz", "tluszcz g", "tluszcze", "f", "fat", "fat g"],
  carbs: ["w", "w g", "wegle", "wegle g", "weglowodany", "weglowodany g", "c", "carbs", "carbs g"],
  prepTime: ["czas", "czas przygotowania", "czas min", "time", "prep time"],
  batch: ["batch", "batch size", "porcje", "porcji", "liczba porcji"],
  fridgeLife: ["lodowka", "lodowka dni", "przechowywanie", "fridge", "fridge life"],
  freezable: ["mrozenie", "mrozic", "zamrazanie", "freezer", "freezable", "freezing"],
};

/** Lowercase ASCII words only: "Składniki i gramatura" -> "skladniki i gramatura", "B (g)" -> "b g". */
export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[łŁ]/g, "l")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fieldFor(header: string): Field | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;
  for (const [field, aliases] of Object.entries(ALIASES) as [Field, string[]][]) {
    if (aliases.includes(normalized)) return field;
  }
  // "Składniki i gramatura (na porcję)" and similar long variants.
  if (normalized.startsWith("skladniki")) return "ingredients";
  return null;
}

export function resolveColumns(headerRow: string[]): Record<Field, number | null> {
  const columns = Object.fromEntries(
    (Object.keys(ALIASES) as Field[]).map((field) => [field, null]),
  ) as Record<Field, number | null>;
  headerRow.forEach((cell, index) => {
    const field = fieldFor(cell ?? "");
    if (field && columns[field] === null) columns[field] = index;
  });
  return columns;
}

function hasRequired(columns: Record<Field, number | null>): boolean {
  return REQUIRED.every((field) => columns[field] !== null);
}

/* ----------------------------------------------------------------------------
 * Cell parsing with Zod. Numbers may arrive as strings with Polish commas.
 * -------------------------------------------------------------------------- */

const DASH = /^[-–—]+$/;

const text = z.preprocess((v) => (v == null ? "" : String(v).replace(/ /g, " ").trim()), z.string());

const optionalText = text.transform((v) => (v === "" || DASH.test(v) ? null : v));

const number = z.preprocess(
  (v) => {
    if (typeof v === "number") return v;
    const cleaned = String(v ?? "")
      .replace(/ /g, "")
      .replace(/\s+/g, "")
      .replace(",", ".")
      .replace(/(kcal|g)$/i, "");
    if (cleaned === "") return undefined;
    return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : cleaned;
  },
  z.number({ error: "musi być liczbą" }).nonnegative("nie może być ujemna"),
);

const variant = text.transform((v, ctx): Variant => {
  const upper = v.toUpperCase();
  if (upper === "" || DASH.test(upper) || ["NEUTRAL", "UNIWERSALNE", "OBA", "BOTH"].includes(upper)) return null;
  if (upper === "DT" || upper === "DNT") return upper;
  ctx.addIssue({ code: "custom", message: `nieznana wersja „${v}” (oczekiwano DT, DNT lub pusto)` });
  return z.NEVER;
});

const freezable = text.transform((v): boolean | null => {
  const lower = v.toLowerCase();
  if (["tak", "yes", "true", "1", "t", "y"].includes(lower)) return true;
  if (["nie", "no", "false", "0", "n"].includes(lower)) return false;
  return null;
});

const rowSchema = z.object({
  category: text.transform((v) => v || "Inne"),
  name: text.pipe(z.string().min(1, "brak nazwy dania")),
  variant,
  ingredients: text,
  kcal: number,
  protein: number,
  fat: number,
  carbs: number,
  prepTime: optionalText,
  batch: optionalText,
  fridgeLife: optionalText,
  freezable,
});

const POLISH: Record<string, string> = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (char) => POLISH[char] ?? char)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ----------------------------------------------------------------------------
 * Rows -> grouped meals
 * -------------------------------------------------------------------------- */

export class MealSheetFormatError extends Error {}

/** Finds the header row: the first row where every required column resolves. */
export function findHeader(rows: string[][]): { index: number; columns: Record<Field, number | null> } {
  for (let index = 0; index < rows.length; index++) {
    const columns = resolveColumns(rows[index]);
    if (hasRequired(columns)) return { index, columns };
  }
  throw new MealSheetFormatError(
    `Nie znaleziono wiersza nagłówka. Wymagane kolumny: ${REQUIRED.join(", ")} (np. Danie, Kcal, B, T, W).`,
  );
}

/**
 * Turns raw sheet rows into grouped meals.
 *
 * Empty rows are ignored. A row that fails validation is skipped and reported
 * in `issues` with its sheet row number, so one typo never breaks the library.
 */
export function parseMealRows(rows: string[][]): MealLibrary {
  const { index: headerIndex, columns } = findHeader(rows);
  const cell = (row: string[], field: Field) => {
    const col = columns[field];
    return col === null ? "" : (row[col] ?? "");
  };

  const byKey = new Map<string, Meal>();
  const categories: string[] = [];
  const issues: RowIssue[] = [];

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const rowNumber = headerIndex + offset + 2; // 1-based sheet row
    if (row.every((value) => String(value ?? "").trim() === "")) return;

    const parsed = rowSchema.safeParse({
      category: cell(row, "category"),
      name: cell(row, "name"),
      variant: cell(row, "variant"),
      ingredients: cell(row, "ingredients"),
      kcal: cell(row, "kcal"),
      protein: cell(row, "protein"),
      fat: cell(row, "fat"),
      carbs: cell(row, "carbs"),
      prepTime: cell(row, "prepTime"),
      batch: cell(row, "batch"),
      fridgeLife: cell(row, "fridgeLife"),
      freezable: cell(row, "freezable"),
    });

    if (!parsed.success) {
      issues.push({
        row: rowNumber,
        name: cell(row, "name").trim() || null,
        problems: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      });
      return;
    }

    const data = parsed.data;
    const mealKey = slugify(data.name);
    if (!mealKey) {
      issues.push({ row: rowNumber, name: data.name, problems: ["nazwa nie zawiera liter ani cyfr"] });
      return;
    }

    let meal = byKey.get(mealKey);
    if (!meal) {
      meal = { key: mealKey, name: data.name, category: data.category, variants: [] };
      byKey.set(mealKey, meal);
      if (!categories.includes(data.category)) categories.push(data.category);
    } else if (meal.category !== data.category) {
      issues.push({
        row: rowNumber,
        name: data.name,
        problems: [`kategoria „${data.category}” różni się od „${meal.category}” w pierwszym wierszu tego dania; użyto pierwszej`],
      });
    }

    if (meal.variants.some((existing) => existing.variant === data.variant)) {
      issues.push({
        row: rowNumber,
        name: data.name,
        problems: [`powtórzony wariant ${data.variant ?? "uniwersalny"}; użyto pierwszego wystąpienia`],
      });
      return;
    }

    const mealVariant: MealVariant = {
      key: `${mealKey}:${data.variant?.toLowerCase() ?? "base"}`,
      mealKey,
      name: meal.name,
      category: meal.category,
      variant: data.variant,
      ingredients: data.ingredients,
      kcal: data.kcal,
      protein_g: data.protein,
      fat_g: data.fat,
      carbs_g: data.carbs,
      prepTime: data.prepTime,
      batch: data.batch,
      fridgeLife: data.fridgeLife,
      freezable: data.freezable,
      row: rowNumber,
    };
    meal.variants.push(mealVariant);
  });

  return { meals: [...byKey.values()], categories, issues, columns };
}
