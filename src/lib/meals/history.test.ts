import test from "node:test";
import assert from "node:assert/strict";

import type { PlannedMeal } from "@/lib/db/day-plans";
import type { DayType, Macros } from "@/lib/db/helpers";
import type { PrepBatch } from "@/lib/db/prep";
import { buildHistory } from "./history.ts";

const targets: Record<DayType, Macros> = {
  DT: { kcal: 2460, protein_g: 200, fat_g: 60, carbs_g: 280 },
  DNT: { kcal: 2360, protein_g: 220, fat_g: 80, carbs_g: 190 },
};

function meal(date: string, name: string, kcal: number, protein = 50): PlannedMeal {
  return {
    id: `${date}-${name}`,
    plan_date: date,
    slot: "Obiad",
    position: 0,
    status: "eaten",
    source: "sheet",
    meal_key: name,
    meal_name: name,
    variant: "DT",
    portions: 1,
    portion_id: null,
    eaten_at: `${date}T12:00:00Z`,
    approximate: false,
    kcal,
    protein_g: protein,
    fat_g: 10,
    carbs_g: 20,
  } as PlannedMeal;
}

function batch(date: string, name: string, portions: number): PrepBatch {
  return {
    id: `${date}-${name}`,
    meal_key: name,
    meal_name: name,
    variant: "DT",
    cooked_on: date,
    portions_made: portions,
    note: null,
    kcal: 700,
    protein_g: 60,
    fat_g: 20,
    carbs_g: 70,
  } as PrepBatch;
}

test("sums a day's eaten macros against that day's target", () => {
  const days = buildHistory({
    meals: [meal("2026-09-16", "Chicken Rice", 700, 60), meal("2026-09-16", "Skyr bowl", 500, 40)],
    batches: [],
    dayTypes: { "2026-09-16": "DNT" },
    targets,
    defaultDayType: "DT",
  });

  assert.equal(days.length, 1);
  assert.equal(days[0].eaten.kcal, 1200);
  assert.equal(days[0].eaten.protein_g, 100);
  assert.equal(days[0].dayType, "DNT");
  assert.equal(days[0].target.kcal, 2360);
});

test("falls back to the default day type when the date has no plan", () => {
  const days = buildHistory({
    meals: [meal("2026-09-15", "Turkey Pasta", 800)],
    batches: [],
    dayTypes: {},
    targets,
    defaultDayType: "DT",
  });

  assert.equal(days[0].dayType, "DT");
  assert.equal(days[0].target.kcal, 2460);
});

test("newest day first, and a cook-only day still appears", () => {
  const days = buildHistory({
    meals: [meal("2026-09-14", "Chicken Rice", 700)],
    batches: [batch("2026-09-16", "Turkey Pasta", 6)],
    dayTypes: {},
    targets,
    defaultDayType: "DT",
  });

  assert.deepEqual(
    days.map((day) => day.date),
    ["2026-09-16", "2026-09-14"],
  );
  // The cook-only day has no meals but keeps the batch.
  assert.equal(days[0].eaten.kcal, 0);
  assert.deepEqual(days[0].cooked, [{ name: "Turkey Pasta", variant: "DT", portions: 6 }]);
});

test("days without any activity are left out entirely", () => {
  const days = buildHistory({
    meals: [],
    batches: [],
    dayTypes: { "2026-09-16": "DT", "2026-09-15": "DNT" },
    targets,
    defaultDayType: "DT",
  });

  assert.deepEqual(days, []);
});
