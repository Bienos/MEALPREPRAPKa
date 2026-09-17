/**
 * Serializable shapes passed from the Today server component into client
 * components. Pure types plus small pure helpers, safe to import on the client.
 */

export type DayType = "DT" | "DNT";

export type MealStatus = "planned" | "eaten" | "skipped" | "swapped" | "adhoc";

export type Macros = {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
};

export type TodayMeal = Macros & {
  id: string;
  slot: string;
  position: number;
  status: MealStatus;
  mealKey: string | null;
  mealName: string;
  variant: DayType | null;
  portions: number;
  eatenAt: string | null;
  /** True when an available fridge/freezer portion matches this meal. */
  prepared: boolean;
};

export const PORTION_OPTIONS = [0.75, 1, 1.25, 1.5] as const;

/** "1×", "1,25×" — Polish decimal comma, no trailing zeros. */
export function portionLabel(portions: number): string {
  const rounded = Math.round(portions * 100) / 100;
  return `${String(rounded).replace(".", ",")}×`;
}

export function sumMacros(meals: Macros[]): Macros {
  return meals.reduce<Macros>(
    (total, meal) => ({
      kcal: total.kcal + meal.kcal,
      protein_g: total.protein_g + meal.protein_g,
      fat_g: total.fat_g + meal.fat_g,
      carbs_g: total.carbs_g + meal.carbs_g,
    }),
    { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
  );
}

/** Target minus what has actually been eaten. Can go negative on purpose. */
export function remainingMacros(target: Macros, meals: TodayMeal[]): Macros {
  const eaten = sumMacros(meals.filter((meal) => meal.status === "eaten"));
  return {
    kcal: target.kcal - eaten.kcal,
    protein_g: target.protein_g - eaten.protein_g,
    fat_g: target.fat_g - eaten.fat_g,
    carbs_g: target.carbs_g - eaten.carbs_g,
  };
}

export function nextPlannedMeal(meals: TodayMeal[]): TodayMeal | undefined {
  return meals.find((meal) => meal.status === "planned");
}

/** Rescales a macro snapshot when the portion multiplier changes. */
export function rescaleMacros(meal: TodayMeal, portions: number): Macros {
  const ratio = portions / meal.portions;
  return {
    kcal: Math.round(meal.kcal * ratio),
    protein_g: Math.round(meal.protein_g * ratio * 10) / 10,
    fat_g: Math.round(meal.fat_g * ratio * 10) / 10,
    carbs_g: Math.round(meal.carbs_g * ratio * 10) / 10,
  };
}

export function macroLine(macros: Macros): string {
  return `${Math.round(macros.protein_g)} B · ${Math.round(macros.fat_g)} T · ${Math.round(macros.carbs_g)} W`;
}
