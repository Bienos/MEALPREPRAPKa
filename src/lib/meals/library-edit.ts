import "server-only";

import { hasServiceAccountEnv } from "@/lib/env";
import { appendRow, readMealTabFresh, writeCells } from "@/lib/google-sheets/write";
import { refreshMealLibrary } from "./library";
import { planMealAppend, planMealEdit, type MealInput } from "./sheet-edit";
import type { Variant } from "./types";

export type SaveResult = { ok: true; mealKey: string } | { ok: false; reason: string };

/** Editing needs the service account; the public CSV path can only read. */
export function canEditSheet(): boolean {
  return hasServiceAccountEnv();
}

const NO_ACCOUNT =
  "Edytowanie wymaga konta serwisowego Google z dostępem Edytora do arkusza. Instrukcja jest w DEPLOY.md.";

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Saves a meal to the sheet: an edit of one existing variant when `target` is
 * given, otherwise a new row. Reads the sheet fresh, plans the exact cells
 * (see sheet-edit.ts for the safety rules), writes them, then reloads the
 * library so every screen shows the change.
 */
export async function saveMealToSheet(
  target: { mealKey: string; variant: Variant } | null,
  input: MealInput,
): Promise<SaveResult> {
  if (!canEditSheet()) return { ok: false, reason: NO_ACCOUNT };
  try {
    const { title, rows } = await readMealTabFresh();
    if (target) {
      const plan = planMealEdit(rows, target, input);
      if (!plan.ok) return plan;
      await writeCells(title, plan.writes);
      console.info(`[meals] edited "${input.name}" ${target.variant ?? ""}: ${plan.writes.length} cell(s)`);
      await refreshMealLibrary();
      return { ok: true, mealKey: plan.mealKey };
    }
    const plan = planMealAppend(rows, input);
    if (!plan.ok) return plan;
    await appendRow(title, plan.afterRow, plan.row);
    console.info(`[meals] added "${input.name}" ${input.variant ?? ""} after row ${plan.afterRow}`);
    await refreshMealLibrary();
    return { ok: true, mealKey: plan.mealKey };
  } catch (error) {
    console.error("[meals] saving to the sheet failed:", describe(error));
    return { ok: false, reason: describe(error) };
  }
}
