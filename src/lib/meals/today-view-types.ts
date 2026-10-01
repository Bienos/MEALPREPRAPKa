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

/** Raw planned-meal row, as far as Today needs it. */
type PlannedMealRow = Macros & {
  id: string;
  slot: string;
  position: number;
  status: MealStatus;
  meal_key: string | null;
  meal_name: string;
  variant: DayType | null;
  portions: number;
  eaten_at: string | null;
};

export function toTodayMeal(meal: PlannedMealRow, prepared = false): TodayMeal {
  return {
    id: meal.id,
    slot: meal.slot,
    position: meal.position,
    status: meal.status,
    mealKey: meal.meal_key,
    mealName: meal.meal_name,
    variant: meal.variant,
    portions: meal.portions,
    kcal: meal.kcal,
    protein_g: meal.protein_g,
    fat_g: meal.fat_g,
    carbs_g: meal.carbs_g,
    eatenAt: meal.eaten_at,
    prepared,
  };
}

/** Tomorrow, as a one-line summary on Today. The full day lives on its own page. */
export type TomorrowPreview = {
  date: string;
  label: string;
  dayType: DayType;
  /** Meals already planned for that day. */
  count: number;
  kcal: number;
  names: string[];
};

/** Today, or a day you are looking at from the calendar. */
export type DayWhen = "today" | "past" | "future";

/** One meal the "Dodaj" sheet can log in a tap: a sheet dish for today's day type. */
export type AddOption = Macros & {
  mealKey: string;
  name: string;
  category: string;
  variant: DayType | null;
  /** Raw ingredient text, so search finds "Chicken Rice" by typing "kurczak". */
  ingredients: string;
  /** Prepared portions waiting in the fridge or freezer. */
  ready: number;
};

/** True for food that counts towards today: ticked off, or logged outside the plan. */
export function isEaten(meal: Pick<TodayMeal, "status">): boolean {
  return meal.status === "eaten" || meal.status === "adhoc";
}

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
  const eaten = sumMacros(meals.filter(isEaten));
  return {
    kcal: target.kcal - eaten.kcal,
    protein_g: target.protein_g - eaten.protein_g,
    fat_g: target.fat_g - eaten.fat_g,
    carbs_g: target.carbs_g - eaten.carbs_g,
  };
}

/**
 * Where a slot falls in the day. Slots are free text (the default day's
 * "Posiłek 2", a library meal's "Obiad"), so this reads the name. Unknown
 * slots go after everything known, and food logged outside the plan last.
 */
function slotRank(meal: Pick<TodayMeal, "slot" | "status">): number {
  if (meal.status === "adhoc") return 9;
  const slot = meal.slot.toLowerCase();
  if (slot.startsWith("śniadanie")) return 0;
  if (slot === "posiłek 2" || slot.startsWith("obiad")) return 1;
  if (slot === "posiłek 3" || slot.startsWith("przekąska")) return 2;
  if (slot.startsWith("kolacja")) return 3;
  if (slot.startsWith("białko")) return 4;
  return 5;
}

/** The day in the order you eat it. Within a slot, the order they were added. */
export function sortDay<T extends Pick<TodayMeal, "slot" | "status" | "position">>(meals: T[]): T[] {
  return [...meals].sort((a, b) => slotRank(a) - slotRank(b) || a.position - b.position);
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
