import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { CORRECTION_BLOCKS, planDinnerOut, projectDay, suggestCorrections, type DayMeal } from "./rebalance.ts";
import type { Meal, MealVariant } from "./types.ts";

const DT_TARGET = { kcal: 2460, protein_g: 200, fat_g: 60, carbs_g: 280 };

function dayMeal(over: Partial<DayMeal> & { id: string }): DayMeal {
  return {
    mealKey: "meal",
    mealName: "Meal",
    slot: "Obiad",
    status: "planned",
    portions: 1,
    kcal: 800,
    protein_g: 60,
    fat_g: 20,
    carbs_g: 90,
    ...over,
  };
}

function libMeal(key: string, over: Partial<MealVariant> = {}): Meal {
  const variant = (v: MealVariant["variant"]): MealVariant => ({
    key: `${key}:${v ?? "base"}`,
    mealKey: key,
    name: key,
    category: "Kolacja",
    ingredients: "",
    kcal: 600,
    protein_g: 45,
    fat_g: 18,
    carbs_g: 55,
    prepTime: "10 min",
    batch: "1",
    fridgeLife: "1 dzień",
    freezable: false,
    row: 1,
    variant: v,
    ...over,
  });
  return { key, name: key, category: over.category ?? "Kolacja", variants: [variant("DT"), variant("DNT")] };
}

describe("projection", () => {
  test("separates eaten from planned and projects the day", () => {
    const meals = [
      dayMeal({ id: "a", status: "eaten", kcal: 772, protein_g: 66, fat_g: 16, carbs_g: 91 }),
      dayMeal({ id: "b", status: "planned", kcal: 800, protein_g: 60, fat_g: 20, carbs_g: 90 }),
    ];
    const projection = projectDay(DT_TARGET, meals);
    assert.equal(projection.eaten.kcal, 772);
    assert.equal(projection.planned.kcal, 800);
    assert.equal(projection.projected.kcal, 1572);
    assert.equal(projection.delta.kcal, 1572 - 2460);
    assert.equal(projection.remaining.kcal, 2460 - 772);
  });

  test("an ad-hoc meal counts as eaten", () => {
    const projection = projectDay(DT_TARGET, [
      dayMeal({ id: "kebab", status: "adhoc", kcal: 900, protein_g: 40, fat_g: 45, carbs_g: 80 }),
    ]);
    assert.equal(projection.eaten.kcal, 900);
    assert.equal(projection.remaining.kcal, 1560);
  });

  test("skipped meals count towards neither side", () => {
    const projection = projectDay(DT_TARGET, [dayMeal({ id: "s", status: "skipped" })]);
    assert.equal(projection.eaten.kcal, 0);
    assert.equal(projection.planned.kcal, 0);
  });
});

describe("corrections after an unplanned meal", () => {
  const library = [
    libMeal("light", { kcal: 379, protein_g: 52, fat_g: 7, carbs_g: 25 }),
    libMeal("medium", { kcal: 605, protein_g: 45, fat_g: 19, carbs_g: 60 }),
    libMeal("heavy", { kcal: 900, protein_g: 55, fat_g: 40, carbs_g: 85 }),
  ];

  // A big fatty kebab, then a normal dinner still planned.
  const meals = [
    dayMeal({ id: "kebab", status: "adhoc", mealName: "Kebab", kcal: 900, protein_g: 40, fat_g: 45, carbs_g: 80 }),
    dayMeal({ id: "breakfast", status: "eaten", kcal: 772, protein_g: 66, fat_g: 16, carbs_g: 91 }),
    dayMeal({ id: "dinner", status: "planned", slot: "Kolacja", mealKey: "medium", mealName: "medium", kcal: 605, protein_g: 45, fat_g: 19, carbs_g: 60 }),
    dayMeal({ id: "lunch", status: "planned", slot: "Obiad", mealKey: "heavy", mealName: "heavy", kcal: 900, protein_g: 55, fat_g: 40, carbs_g: 85 }),
  ];

  test("never proposes more than three changes", () => {
    const { suggestions } = suggestCorrections({ target: DT_TARGET, meals, library, dayType: "DT" });
    assert.ok(suggestions.length <= 3);
  });

  test("every suggestion moves the day closer to target", () => {
    const { projection, suggestions } = suggestCorrections({ target: DT_TARGET, meals, library, dayType: "DT" });
    assert.ok(suggestions.length > 0);
    for (const suggestion of suggestions) {
      const after = Math.abs(projection.delta.kcal + suggestion.difference.kcal);
      assert.ok(after < Math.abs(projection.delta.kcal), `${suggestion.label} did not help`);
    }
  });

  test("never touches a meal that was already eaten", () => {
    const { suggestions } = suggestCorrections({ target: DT_TARGET, meals, library, dayType: "DT" });
    for (const suggestion of suggestions) {
      if (suggestion.kind === "block") continue;
      assert.equal(suggestion.meal.status, "planned");
    }
  });

  test("proposes at most one change per meal", () => {
    const { suggestions } = suggestCorrections({ target: DT_TARGET, meals, library, dayType: "DT" });
    const mealIds = suggestions.flatMap((s) => (s.kind === "block" ? [] : [s.meal.id]));
    assert.equal(new Set(mealIds).size, mealIds.length);
  });

  test("stays quiet when the day is already close enough", () => {
    const onTrack = [
      dayMeal({ id: "a", status: "eaten", kcal: 2400, protein_g: 195, fat_g: 58, carbs_g: 275 }),
      dayMeal({ id: "b", status: "planned", kcal: 60, protein_g: 5, fat_g: 2, carbs_g: 5 }),
    ];
    const { suggestions } = suggestCorrections({ target: DT_TARGET, meals: onTrack, library, dayType: "DT" });
    assert.deepEqual(suggestions, []);
  });

  test("suggests a correction block when the day is short on food", () => {
    const short = [
      dayMeal({ id: "a", status: "eaten", kcal: 2200, protein_g: 180, fat_g: 55, carbs_g: 250 }),
      dayMeal({ id: "b", status: "planned", kcal: 100, protein_g: 8, fat_g: 3, carbs_g: 10 }),
    ];
    const { suggestions } = suggestCorrections({ target: DT_TARGET, meals: short, library, dayType: "DT" });
    assert.ok(suggestions.some((s) => s.kind === "block"));
  });

  test("correction blocks cover protein, carbs and fat", () => {
    const leads = new Set(CORRECTION_BLOCKS.map((block) => block.leads));
    assert.deepEqual([...leads].sort(), ["carbs", "fat", "protein"]);
  });
});

describe("dinner out", () => {
  const meals = [
    dayMeal({ id: "breakfast", status: "eaten", kcal: 700, protein_g: 60, fat_g: 15, carbs_g: 80 }),
    dayMeal({ id: "lunch", status: "planned", slot: "Obiad", kcal: 800, protein_g: 60, fat_g: 20, carbs_g: 90 }),
    dayMeal({ id: "snack", status: "planned", slot: "Przekąska", kcal: 500, protein_g: 10, fat_g: 20, carbs_g: 70 }),
  ];

  test("frees roughly the calories you reserve", () => {
    const { suggestions, freed, needed } = planDinnerOut({ target: DT_TARGET, meals, reserve: 900 });
    assert.ok(needed > 0);
    assert.ok(suggestions.length > 0);
    assert.ok(freed > 0);
  });

  test("keeping protein means cutting the least protein-dense meal first", () => {
    const { suggestions } = planDinnerOut({ target: DT_TARGET, meals, reserve: 900, preserveProtein: true });
    const first = suggestions[0];
    assert.ok(first.kind === "portion");
    if (first.kind === "portion") assert.equal(first.meal.id, "snack");
  });

  test("only shrinks future meals, never eaten ones", () => {
    const { suggestions } = planDinnerOut({ target: DT_TARGET, meals, reserve: 900 });
    for (const suggestion of suggestions) {
      if (suggestion.kind === "portion") assert.equal(suggestion.meal.status, "planned");
    }
  });

  test("does nothing when the day already has room", () => {
    const { suggestions, needed } = planDinnerOut({ target: DT_TARGET, meals, reserve: 100 });
    assert.equal(needed, 0);
    assert.deepEqual(suggestions, []);
  });
});
