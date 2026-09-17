"use server";

import { redirect } from "next/navigation";

import { replaceDefaultDayMeals, type NewDefaultDayMeal } from "@/lib/db/default-day";
import type { DayType } from "@/lib/db/helpers";
import { DEFAULT_SLOTS } from "@/lib/meals/slots";

/**
 * Saves one day type's template. Each slot's value is `mealKey|variant`
 * ("" means the slot is left empty and simply not stored).
 */
export async function saveDefaultDayAction(dayType: DayType, formData: FormData): Promise<void> {
  const meals: NewDefaultDayMeal[] = [];

  DEFAULT_SLOTS.forEach((slot, index) => {
    const raw = String(formData.get(`slot-${index}`) ?? "").trim();
    if (!raw) return;
    const [mealKey, variant] = raw.split("|");
    if (!mealKey) return;
    meals.push({
      slot,
      position: index,
      meal_key: mealKey,
      variant: variant === "DT" || variant === "DNT" ? variant : null,
      portions: 1,
    });
  });

  await replaceDefaultDayMeals(dayType, meals);
  redirect("/");
}
