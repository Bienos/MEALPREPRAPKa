import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  macroLine,
  nextPlannedMeal,
  portionLabel,
  remainingMacros,
  rescaleMacros,
  sumMacros,
  type TodayMeal,
} from "./today-view-types.ts";

const DT_TARGET = { kcal: 2460, protein_g: 200, fat_g: 60, carbs_g: 280 };

function meal(overrides: Partial<TodayMeal> & { id: string }): TodayMeal {
  return {
    slot: "Obiad",
    position: 0,
    status: "planned",
    mealKey: "chicken-rice",
    mealName: "Chicken Rice",
    variant: "DT",
    portions: 1,
    kcal: 789,
    protein_g: 59,
    fat_g: 17,
    carbs_g: 100,
    eatenAt: null,
    prepared: false,
    ...overrides,
  };
}

describe("remaining macros", () => {
  test("a day with nothing eaten leaves the full target", () => {
    const meals = [meal({ id: "a" }), meal({ id: "b" })];
    assert.deepEqual(remainingMacros(DT_TARGET, meals), DT_TARGET);
  });

  test("only eaten meals are subtracted, not planned ones", () => {
    const meals = [
      meal({ id: "a", status: "eaten", kcal: 772, protein_g: 66, fat_g: 16, carbs_g: 91 }),
      meal({ id: "b", status: "planned" }),
      meal({ id: "c", status: "skipped", kcal: 500, protein_g: 40, fat_g: 10, carbs_g: 50 }),
    ];
    assert.deepEqual(remainingMacros(DT_TARGET, meals), {
      kcal: 2460 - 772,
      protein_g: 200 - 66,
      fat_g: 60 - 16,
      carbs_g: 280 - 91,
    });
  });

  test("going over target yields negative values rather than clamping", () => {
    const meals = [meal({ id: "a", status: "eaten", kcal: 3000, protein_g: 250, fat_g: 90, carbs_g: 320 })];
    const remaining = remainingMacros(DT_TARGET, meals);
    assert.equal(remaining.kcal, -540);
    assert.ok(remaining.protein_g < 0);
  });
});

describe("next meal", () => {
  test("is the first meal still planned, in order", () => {
    const meals = [
      meal({ id: "a", status: "eaten", position: 0 }),
      meal({ id: "b", status: "planned", position: 1 }),
      meal({ id: "c", status: "planned", position: 2 }),
    ];
    assert.equal(nextPlannedMeal(meals)?.id, "b");
  });

  test("advances after the current one is eaten", () => {
    const meals = [meal({ id: "a", status: "eaten" }), meal({ id: "b", status: "eaten" }), meal({ id: "c" })];
    assert.equal(nextPlannedMeal(meals)?.id, "c");
  });

  test("is undefined once the whole day is logged", () => {
    assert.equal(nextPlannedMeal([meal({ id: "a", status: "eaten" })]), undefined);
  });

  test("skips meals that are not in a planned state", () => {
    const meals = [meal({ id: "a", status: "skipped" }), meal({ id: "b", status: "planned" })];
    assert.equal(nextPlannedMeal(meals)?.id, "b");
  });
});

describe("portions", () => {
  test("1x to 1.25x scales the macro snapshot", () => {
    const scaled = rescaleMacros(meal({ id: "a" }), 1.25);
    assert.equal(scaled.kcal, Math.round(789 * 1.25));
    assert.equal(scaled.protein_g, 73.8);
    assert.equal(scaled.carbs_g, 125);
  });

  test("scaling is relative to the current multiplier, not to 1x", () => {
    const already = meal({ id: "a", portions: 1.5, kcal: 1184, protein_g: 88.5, fat_g: 25.5, carbs_g: 150 });
    const scaled = rescaleMacros(already, 0.75);
    assert.equal(scaled.kcal, Math.round(1184 * 0.5));
    assert.equal(scaled.carbs_g, 75);
  });

  test("labels use a Polish decimal comma", () => {
    assert.equal(portionLabel(1), "1×");
    assert.equal(portionLabel(1.25), "1,25×");
    assert.equal(portionLabel(0.75), "0,75×");
  });
});

test("sumMacros totals a list", () => {
  assert.deepEqual(sumMacros([meal({ id: "a" }), meal({ id: "b" })]), {
    kcal: 1578,
    protein_g: 118,
    fat_g: 34,
    carbs_g: 200,
  });
});

test("macroLine renders the Polish B/T/W shorthand", () => {
  assert.equal(macroLine({ kcal: 789, protein_g: 59.4, fat_g: 17, carbs_g: 100 }), "59 B · 17 T · 100 W");
});
