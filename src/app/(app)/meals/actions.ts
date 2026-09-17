"use server";

import { refresh, updateTag } from "next/cache";

import { MEALS_CACHE_TAG, refreshMealLibrary } from "@/lib/meals/library";

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
