/** Serializable shapes shared between the Prep server pages and their client components. */

export type DayType = "DT" | "DNT";

export type PrepDayView = { date: string; label: string; dayType: DayType };

export type PrepItemView = {
  id: string;
  mealKey: string;
  mealName: string;
  variant: DayType | null;
  portions: number;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
};

/** One dish, with its DT/DNT split folded together for display. */
export type PrepDishView = {
  mealKey: string;
  mealName: string;
  totalPortions: number;
  itemId: string;
  split: { variant: DayType | null; portions: number }[];
};

export function groupIntoDishes(items: PrepItemView[]): PrepDishView[] {
  const dishes = new Map<string, PrepDishView>();
  for (const item of items) {
    const existing = dishes.get(item.mealKey);
    if (existing) {
      existing.totalPortions += item.portions;
      existing.split.push({ variant: item.variant, portions: item.portions });
    } else {
      dishes.set(item.mealKey, {
        mealKey: item.mealKey,
        mealName: item.mealName,
        totalPortions: item.portions,
        itemId: item.id,
        split: [{ variant: item.variant, portions: item.portions }],
      });
    }
  }
  return [...dishes.values()];
}

export type FridgeGroup = {
  mealKey: string | null;
  mealName: string;
  variant: DayType | null;
  location: "fridge" | "freezer";
  portionIds: string[];
  /** Earliest expiry in the group, which is what the list sorts by. */
  expiresOn: string | null;
  daysLeft: number | null;
};

export function expiryLabel(daysLeft: number | null): string {
  if (daysLeft === null) return "Bez daty";
  if (daysLeft < 0) return "Po terminie";
  if (daysLeft === 0) return "Zjedz dziś";
  if (daysLeft === 1) return "Zjedz jutro";
  return `Świeże jeszcze ${daysLeft} dni`;
}

export function isUrgent(daysLeft: number | null): boolean {
  return daysLeft !== null && daysLeft <= 1;
}
