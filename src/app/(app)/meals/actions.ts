"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { MEALS_CACHE_TAG, refreshMealLibrary } from "@/lib/meals/library";
import { saveMealToSheet } from "@/lib/meals/library-edit";

export type SyncState = { status: "idle" | "ok" | "error"; message: string };

/** [ Sync meals ]: re-reads the sheet now and expires the cached copy on success. */
export async function syncMeals(): Promise<SyncState> {
  const snapshot = await refreshMealLibrary();
  if (snapshot.source === "sheets") {
    updateTag(MEALS_CACHE_TAG);
    refresh();
    return {
      status: "ok",
      message: snapshot.sheetTitle
        ? `Pobrano ${snapshot.library.meals.length} posiłków z zakładki „${snapshot.sheetTitle}”.`
        : `Pobrano ${snapshot.library.meals.length} posiłków.`,
    };
  }
  return { status: "error", message: snapshot.error ?? "Nie udało się pobrać arkusza." };
}

export type SaveMealState = { ok: boolean; message: string } | null;

const variantSchema = z.enum(["DT", "DNT"]).nullable();
const number = z.coerce.number();

const mealInputSchema = z.object({
  name: z.string(),
  category: z.string(),
  variant: variantSchema,
  ingredients: z.string(),
  kcal: number,
  protein_g: number,
  fat_g: number,
  carbs_g: number,
  prepTime: z.string(),
  batch: z.string(),
  fridgeLife: z.string(),
  freezable: z.boolean().nullable(),
});

/**
 * Saves the meal form to the sheet: `target` is the variant being edited, or
 * null for a new meal. On success it opens the meal's page.
 */
export async function saveMealAction(
  target: { mealKey: string; variant: "DT" | "DNT" | null } | null,
  raw: unknown,
): Promise<SaveMealState> {
  const parsed = mealInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Sprawdź pola formularza: liczby muszą być liczbami." };

  const result = await saveMealToSheet(target, parsed.data);
  if (!result.ok) return { ok: false, message: result.reason };

  updateTag(MEALS_CACHE_TAG);
  redirect(`/meals/${result.mealKey}`);
}
