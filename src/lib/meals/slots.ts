import { matchesSlot, PREP_SLOTS, PREP_SLOT_LABELS } from "./prep-plan.ts";

/** Slots of a default day, in order. Fixed on purpose: setup stays minimal. */
export const DEFAULT_SLOTS = ["Śniadanie", "Posiłek 2", "Posiłek 3", "Kolacja", "Białko / dodatek"] as const;

/** Which meal of the day a dish is, read from the sheet's own category. */
export type MealKind = "sniadanie" | "obiad" | "kolacja" | "przekaska" | "inne";

export function kindOfCategory(category: string): MealKind {
  for (const slot of PREP_SLOTS) {
    if (matchesSlot(category, slot)) return slot;
  }
  return /^(przekask|lekki)/i.test(category.normalize("NFD").replace(/\p{M}/gu, "")) ? "przekaska" : "inne";
}

/**
 * The name shown on Today for a meal added from the library by hand. The
 * sheet's categories are for browsing ("Meal prep — AIR FRYER"); on the day
 * list they read better as when you eat it.
 */
export function slotNameForCategory(category: string): string {
  const kind = kindOfCategory(category);
  if (kind === "przekaska") return "Przekąska";
  if (kind === "inne") return "Posiłek";
  return PREP_SLOT_LABELS[kind];
}
