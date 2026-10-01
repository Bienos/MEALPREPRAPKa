/**
 * Plans an edit to the meal sheet, as plain data, before anything is written.
 * Pure functions only, so every rule below is unit-tested.
 *
 * Safety rules:
 * - Rows are found by dish name and variant in a fresh read of the sheet,
 *   never by a remembered row number, so a reordered sheet cannot send an
 *   edit to the wrong meal.
 * - Only the columns the app understands are written, and only cells whose
 *   value actually changes. Every other column is left exactly as it is.
 * - Nothing is deleted. A new meal is one new row at the bottom.
 * - A rename that would merge two dishes into one is refused.
 */

import { findHeader, slugify } from "./parse.ts";
import type { Field, Variant } from "./types.ts";

export type MealInput = {
  name: string;
  category: string;
  variant: Variant;
  ingredients: string;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  prepTime: string;
  batch: string;
  fridgeLife: string;
  freezable: boolean | null;
};

/** One cell to set. `row` is the 1-based sheet row, `col` the 0-based column. */
export type CellWrite = { row: number; col: number; value: string | number };

export type EditPlan = { ok: true; mealKey: string; writes: CellWrite[] } | { ok: false; reason: string };
export type AppendPlan = { ok: true; mealKey: string; afterRow: number; row: (string | number)[] } | { ok: false; reason: string };

/** Same name for the whole dish: every DT/DNT row of it. */
const SHARED: Field[] = ["name", "category"];
/** Per variant: only the row being edited. */
const PER_VARIANT: Field[] = ["ingredients", "kcal", "protein", "fat", "carbs", "prepTime", "batch", "fridgeLife", "freezable"];

function cellValue(input: MealInput, field: Field): string | number {
  switch (field) {
    case "name": return input.name.trim();
    case "category": return input.category.trim();
    case "variant": return input.variant ?? "";
    case "ingredients": return input.ingredients.trim();
    case "kcal": return Math.round(input.kcal);
    case "protein": return round1(input.protein_g);
    case "fat": return round1(input.fat_g);
    case "carbs": return round1(input.carbs_g);
    case "prepTime": return input.prepTime.trim();
    case "batch": return input.batch.trim();
    case "fridgeLife": return input.fridgeLife.trim();
    case "freezable": return input.freezable === null ? "" : input.freezable ? "Tak" : "Nie";
  }
}

const YES_NO = /^(tak|nie|yes|no|true|false|0|1|t|n|y)$/i;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Whether a cell already holds this value, so unchanged cells are never rewritten. */
function same(current: string | undefined, next: string | number): boolean {
  const text = String(current ?? "").replace(/ /g, " ").trim();
  if (typeof next === "number") {
    const number = Number(text.replace(/\s+/g, "").replace(",", "."));
    return text !== "" && number === next;
  }
  // The sheet writes "no value" as a dash; an empty field means the same.
  if (next === "" && /^[-–—]*$/.test(text)) return true;
  return text === next;
}

function parseVariant(cell: string | undefined): Variant | "other" {
  const upper = String(cell ?? "").trim().toUpperCase();
  if (upper === "DT" || upper === "DNT") return upper;
  if (upper === "" || /^[-–—]+$/.test(upper) || ["NEUTRAL", "UNIWERSALNE", "OBA", "BOTH"].includes(upper)) return null;
  return "other";
}

type DishRow = { row: number; cells: string[]; variant: Variant | "other" };

/** Every data row grouped by dish key, as the parser groups them. */
function dishRows(rows: string[][]) {
  const { index, columns } = findHeader(rows);
  const nameCol = columns.name as number;
  const byKey = new Map<string, DishRow[]>();
  rows.slice(index + 1).forEach((cells, offset) => {
    const key = slugify(String(cells[nameCol] ?? "").trim());
    if (!key) return;
    const entry: DishRow = { row: index + offset + 2, cells, variant: parseVariant(columns.variant === null ? "" : cells[columns.variant]) };
    byKey.set(key, [...(byKey.get(key) ?? []), entry]);
  });
  return { columns, byKey, lastRow: rows.length };
}

function validate(input: MealInput): string | null {
  if (!input.name.trim()) return "Podaj nazwę posiłku.";
  if (!slugify(input.name)) return "Nazwa musi zawierać litery lub cyfry.";
  for (const value of [input.kcal, input.protein_g, input.fat_g, input.carbs_g]) {
    if (!Number.isFinite(value) || value < 0) return "Kalorie i makro muszą być liczbami 0 lub więcej.";
  }
  return null;
}

/** Edit of one variant of an existing dish. Name and category apply to the whole dish. */
export function planMealEdit(rows: string[][], target: { mealKey: string; variant: Variant }, input: MealInput): EditPlan {
  const invalid = validate(input);
  if (invalid) return { ok: false, reason: invalid };

  const { columns, byKey } = dishRows(rows);
  const dish = byKey.get(target.mealKey);
  const targetRow = dish?.find((entry) => entry.variant === target.variant);
  if (!dish || !targetRow) {
    return { ok: false, reason: "Nie znalazłem tego posiłku w arkuszu. Ktoś go zmienił? Zsynchronizuj i spróbuj jeszcze raz." };
  }

  const newKey = slugify(input.name);
  if (newKey !== target.mealKey && byKey.has(newKey)) {
    return { ok: false, reason: `W arkuszu jest już posiłek „${input.name.trim()}”. Wybierz inną nazwę.` };
  }

  const writes: CellWrite[] = [];
  const write = (entry: DishRow, field: Field) => {
    const col = columns[field];
    if (col === null) return; // The sheet has no such column; leave it that way.
    const value = cellValue(input, field);
    // "Mrożenie" left empty in the form keeps whatever unusual note the cell has.
    if (field === "freezable" && value === "" && !YES_NO.test(String(entry.cells[col] ?? "").trim())) return;
    if (!same(entry.cells[col], value)) writes.push({ row: entry.row, col, value });
  };
  for (const entry of dish) for (const field of SHARED) write(entry, field);
  for (const field of PER_VARIANT) write(targetRow, field);

  return { ok: true, mealKey: newKey, writes };
}

/**
 * A new meal, or a new variant of an existing one, as one row for the bottom
 * of the sheet. A variant joins its dish's category so the two stay grouped.
 */
export function planMealAppend(rows: string[][], input: MealInput): AppendPlan {
  const invalid = validate(input);
  if (invalid) return { ok: false, reason: invalid };
  if (!input.category.trim()) return { ok: false, reason: "Wybierz kategorię." };

  const { columns, byKey, lastRow } = dishRows(rows);
  const mealKey = slugify(input.name);
  const existing = byKey.get(mealKey);
  if (existing?.some((entry) => entry.variant === input.variant)) {
    const label = input.variant ?? "uniwersalny";
    return { ok: false, reason: `„${input.name.trim()}” ma już wariant ${label}. Edytuj go zamiast dodawać.` };
  }

  const categoryCol = columns.category;
  const category =
    existing && categoryCol !== null ? String(existing[0].cells[categoryCol] ?? "").trim() || input.category : input.category;
  const filled: MealInput = { ...input, category };

  const width = Math.max(...Object.values(columns).filter((col): col is number => col !== null)) + 1;
  const row: (string | number)[] = Array.from({ length: width }, () => "");
  for (const field of Object.keys(columns) as Field[]) {
    const col = columns[field];
    if (col !== null) row[col] = cellValue(filled, field);
  }
  return { ok: true, mealKey, afterRow: lastRow, row };
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}
