import "server-only";
import { unstable_cache } from "next/cache";

import { hasSheetsEnv } from "@/lib/env";
import { fetchMealSheet } from "@/lib/google-sheets/client";
import { parseMealRows } from "./parse";
import type { MealLibrary, MealLibrarySnapshot } from "./types";

export const MEALS_CACHE_TAG = "meals";
/** The sheet changes a few times a week; an hour is plenty, and Sync forces it anytime. */
const REVALIDATE_SECONDS = 60 * 60;

type Loaded = { library: MealLibrary; fetchedAt: string; sheetTitle: string | null };

/** Last successful load on this server instance. Served when Google is down. */
let lastGood: Loaded | undefined;

const isProduction = process.env.NODE_ENV === "production";

async function loadFromSheets(): Promise<Loaded> {
  const { title, rows } = await fetchMealSheet();
  const library = parseMealRows(rows);
  const label = title ?? "arkusz publiczny (bez konta serwisowego)";
  if (library.issues.length > 0) {
    console.warn(`[meals] ${library.issues.length} row(s) skipped or flagged in "${label}":`, library.issues);
  }
  console.info(`[meals] loaded ${library.meals.length} meals from "${label}"`);
  return { library, fetchedAt: new Date().toISOString(), sheetTitle: title };
}

/** Persisted in the Next.js data cache, so a warm deployment does not hit Google on every render. */
const loadCached = unstable_cache(loadFromSheets, ["meal-library"], {
  tags: [MEALS_CACHE_TAG],
  revalidate: REVALIDATE_SECONDS,
});

function emptyLibrary(): MealLibrary {
  return {
    meals: [],
    categories: [],
    issues: [],
    columns: {
      category: null, name: null, variant: null, ingredients: null, kcal: null, protein: null,
      fat: null, carbs: null, prepTime: null, batch: null, fridgeLife: null, freezable: null,
    },
  };
}

async function fallback(error: string): Promise<MealLibrarySnapshot> {
  if (lastGood) return { ...lastGood, source: "stale", error };
  if (!isProduction) {
    // Dynamic import keeps the fixture module out of production bundles entirely.
    const { FIXTURE_SHEET_TITLE, fixtureRows } = await import("./fixtures");
    return {
      library: parseMealRows(fixtureRows),
      source: "fixture",
      fetchedAt: null,
      sheetTitle: FIXTURE_SHEET_TITLE,
      error,
    };
  }
  return { library: emptyLibrary(), source: "none", fetchedAt: null, sheetTitle: null, error };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const NOT_CONFIGURED =
  "Brak konfiguracji Google Sheets: ustaw GOOGLE_SHEETS_SPREADSHEET_ID w .env.local.";

/**
 * The meal library for rendering. Never throws: when Google Sheets is not
 * configured or unavailable it degrades to the last good copy, then to
 * fixtures in development, then to an empty library with an error message.
 */
export async function getMealLibrary(): Promise<MealLibrarySnapshot> {
  if (!hasSheetsEnv()) return fallback(NOT_CONFIGURED);
  try {
    lastGood = await loadCached();
    return { ...lastGood, source: "sheets", error: null };
  } catch (err) {
    console.error("[meals] Google Sheets unavailable:", describe(err));
    return fallback(describe(err));
  }
}

/**
 * Manual sync: reads the sheet right now, bypassing the cache. On success the
 * caller should expire the `meals` tag so every instance picks up the new data.
 * On failure the previously cached copy stays in place.
 */
export async function refreshMealLibrary(): Promise<MealLibrarySnapshot> {
  if (!hasSheetsEnv()) return fallback(NOT_CONFIGURED);
  try {
    lastGood = await loadFromSheets();
    return { ...lastGood, source: "sheets", error: null };
  } catch (err) {
    console.error("[meals] sync failed:", describe(err));
    return fallback(describe(err));
  }
}
