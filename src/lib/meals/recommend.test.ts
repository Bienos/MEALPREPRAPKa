import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { isEmergencyCategory, noCookOptions, prepMinutes, rankSwaps } from "./recommend.ts";
import type { Meal, MealVariant } from "./types.ts";

function meal(key: string, over: Partial<MealVariant> = {}, variants: MealVariant["variant"][] = ["DT", "DNT"]): Meal {
  const base = (variant: MealVariant["variant"]): MealVariant => ({
    key: `${key}:${variant ?? "base"}`,
    mealKey: key,
    name: key,
    category: "Meal prep",
    ingredients: "",
    kcal: 800,
    protein_g: 60,
    fat_g: 20,
    carbs_g: 90,
    prepTime: "25 min",
    batch: "4",
    fridgeLife: "3 dni",
    freezable: true,
    row: 1,
    variant,
    ...over,
  });
  return { key, name: key, category: over.category ?? "Meal prep", variants: variants.map(base) };
}

describe("swap ranking", () => {
  const library = [
    meal("far", { kcal: 400, protein_g: 20 }),
    meal("close", { kcal: 805, protein_g: 59 }),
    meal("mid", { kcal: 700, protein_g: 45 }),
    meal("other", { kcal: 900, protein_g: 70 }),
  ];

  test("returns at most three suggestions", () => {
    const swaps = rankSwaps({ meals: library, dayType: "DT", targetKcal: 800, targetProtein: 60 });
    assert.equal(swaps.length, 3);
  });

  test("puts the closest macros first", () => {
    const swaps = rankSwaps({ meals: library, dayType: "DT", targetKcal: 800, targetProtein: 60 });
    assert.equal(swaps[0].mealKey, "close");
  });

  test("a prepared portion outranks a closer macro match", () => {
    const swaps = rankSwaps({
      meals: library,
      dayType: "DT",
      targetKcal: 800,
      targetProtein: 60,
      portions: [{ mealKey: "far", variant: "DT", count: 2, daysLeft: 2, location: "fridge" }],
    });
    assert.equal(swaps[0].mealKey, "far");
    assert.equal(swaps[0].ready, true);
    assert.equal(swaps[0].readyLocation, "fridge");
  });

  test("expiry breaks the tie between equally good prepared portions", () => {
    // Ranking order from the spec: fridge, variant, calories, protein, THEN expiry.
    // So expiry decides only when the macros are equally close.
    const twins = [meal("keeps", { kcal: 800, protein_g: 60 }), meal("urgent", { kcal: 800, protein_g: 60 })];
    const swaps = rankSwaps({
      meals: twins,
      dayType: "DT",
      targetKcal: 800,
      targetProtein: 60,
      portions: [
        { mealKey: "keeps", variant: "DT", count: 1, daysLeft: 3, location: "fridge" },
        { mealKey: "urgent", variant: "DT", count: 1, daysLeft: 0, location: "fridge" },
      ],
      limit: 2,
    });
    assert.equal(swaps[0].mealKey, "urgent");
  });

  test("a much closer macro match still beats a sooner expiry, as the spec orders them", () => {
    const swaps = rankSwaps({
      meals: library,
      dayType: "DT",
      targetKcal: 800,
      targetProtein: 60,
      portions: [
        { mealKey: "close", variant: "DT", count: 1, daysLeft: 3, location: "fridge" },
        { mealKey: "mid", variant: "DT", count: 1, daysLeft: 0, location: "fridge" },
      ],
    });
    assert.equal(swaps[0].mealKey, "close");
  });

  test("never suggests the meal being replaced", () => {
    const swaps = rankSwaps({
      meals: library,
      dayType: "DT",
      targetKcal: 800,
      targetProtein: 60,
      excludeKeys: ["close"],
    });
    assert.ok(!swaps.some((swap) => swap.mealKey === "close"));
  });

  test("prefers the matching day-type variant over a neutral one", () => {
    const dtOnly = meal("dtonly", { kcal: 800, protein_g: 60 }, ["DT"]);
    const neutral = meal("neutral", { kcal: 800, protein_g: 60 }, [null]);
    const swaps = rankSwaps({ meals: [dtOnly, neutral], dayType: "DT", targetKcal: 800, targetProtein: 60 });
    assert.equal(swaps[0].mealKey, "dtonly");
  });

  test("reports the difference against the meal being replaced", () => {
    const swaps = rankSwaps({ meals: [meal("a", { kcal: 835, protein_g: 70 })], dayType: "DT", targetKcal: 800, targetProtein: 60 });
    assert.equal(swaps[0].deltaKcal, 35);
    assert.equal(swaps[0].deltaProtein, 10);
  });

  test("a frequently eaten meal edges out an equal stranger", () => {
    const swaps = rankSwaps({
      meals: [meal("familiar", { kcal: 800, protein_g: 60 }), meal("stranger", { kcal: 800, protein_g: 60 })],
      dayType: "DT",
      targetKcal: 800,
      targetProtein: 60,
      frequency: { familiar: 6 },
      limit: 2,
    });
    assert.equal(swaps[0].mealKey, "familiar");
  });

  test("is deterministic", () => {
    const input = { meals: library, dayType: "DT" as const, targetKcal: 800, targetProtein: 60 };
    assert.deepEqual(rankSwaps(input), rankSwaps(input));
  });
});

describe("no-cook mode", () => {
  const library = [
    meal("curry", { kcal: 700, protein_g: 55 }),
    meal("bomb", { category: "Awaryjne", kcal: 400, protein_g: 58, prepTime: "2 min" }, [null]),
    meal("wraps", { category: "Awaryjne", kcal: 550, protein_g: 45, prepTime: "3 min" }, [null]),
    meal("serek", { category: "Awaryjne", kcal: 546, protein_g: 38, prepTime: "2 min" }, [null]),
  ];

  test("recognises emergency categories from the sheet", () => {
    assert.ok(isEmergencyCategory("Awaryjne"));
    assert.ok(isEmergencyCategory("Awaryjne — NO COOK"));
    assert.ok(isEmergencyCategory("Emergency meals"));
    assert.ok(!isEmergencyCategory("Meal prep"));
  });

  test("reads prep minutes, sorting unknown times last", () => {
    assert.equal(prepMinutes("2 min"), 2);
    assert.equal(prepMinutes("3–5 min"), 5);
    assert.equal(prepMinutes(null), 999);
  });

  test("offers at most three options, one per kind", () => {
    const options = noCookOptions({
      meals: library,
      dayType: "DT",
      remainingKcal: 620,
      remainingProtein: 55,
      portions: [{ mealKey: "curry", variant: "DT", count: 1, daysLeft: 1, location: "fridge" }],
    });
    assert.ok(options.length <= 3);
    assert.deepEqual(options.map((option) => option.kind), ["ready", "fastest", "buy"]);
  });

  test("READY is a prepared portion, and is not repeated as another option", () => {
    const options = noCookOptions({
      meals: library,
      dayType: "DT",
      remainingKcal: 620,
      remainingProtein: 55,
      portions: [{ mealKey: "curry", variant: "DT", count: 1, daysLeft: 1, location: "fridge" }],
    });
    assert.equal(options[0].mealKey, "curry");
    assert.equal(options[0].ready, true);
    assert.equal(new Set(options.map((option) => option.mealKey)).size, options.length);
  });

  test("with an empty fridge it still offers emergency food", () => {
    const options = noCookOptions({ meals: library, dayType: "DT", remainingKcal: 500, remainingProtein: 50 });
    assert.ok(options.length >= 1);
    assert.ok(options.every((option) => isEmergencyCategory(option.category)));
  });
});
