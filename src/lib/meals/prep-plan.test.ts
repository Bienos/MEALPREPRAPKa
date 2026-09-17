import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildPrepPlan,
  availableDishes,
  isMealPrepCategory,
  matchesSlot,
  parseBatchMax,
  parseFridgeDays,
  parsePrepMinutes,
  portionTarget,
  swapAlternatives,
} from "./prep-plan.ts";
import type { Meal, MealVariant } from "./types.ts";

const TARGETS = { DT: { kcal: 2460, protein_g: 200 }, DNT: { kcal: 2360, protein_g: 220 } };

function variant(over: Partial<MealVariant> & { mealKey: string; variant: MealVariant["variant"] }): MealVariant {
  return {
    key: `${over.mealKey}:${over.variant ?? "base"}`,
    name: over.mealKey,
    category: "Meal prep",
    ingredients: "Kurczak 200 g; ryż 110 g",
    kcal: 800,
    protein_g: 60,
    fat_g: 17,
    carbs_g: 100,
    prepTime: "25–30 min",
    batch: "4–6",
    fridgeLife: "3 dni",
    freezable: true,
    row: 1,
    ...over,
  };
}

function meal(key: string, over: Partial<MealVariant> = {}): Meal {
  return {
    key,
    name: key,
    category: over.category ?? "Meal prep",
    variants: [
      variant({ mealKey: key, variant: "DT", ...over }),
      variant({ mealKey: key, variant: "DNT", ...over }),
    ],
  };
}

describe("reading sheet values", () => {
  test("batch takes the upper bound", () => {
    assert.equal(parseBatchMax("4–6"), 6);
    assert.equal(parseBatchMax("6"), 6);
    assert.equal(parseBatchMax("3 słoiki"), 3);
    assert.equal(parseBatchMax(null), 1);
  });

  test("fridge life takes the lower bound, because that is the safe one", () => {
    assert.equal(parseFridgeDays("2–3 dni"), 2);
    assert.equal(parseFridgeDays("3 dni"), 3);
    assert.equal(parseFridgeDays("—"), 0);
  });

  test("prep time takes the upper bound, so the estimate does not undersell", () => {
    assert.equal(parsePrepMinutes("25–30 min"), 30);
    assert.equal(parsePrepMinutes("25 min"), 25);
  });

  test("only meal-prep categories qualify", () => {
    assert.ok(isMealPrepCategory("Meal prep"));
    assert.ok(isMealPrepCategory("Meal prep — ONE POT"));
    assert.ok(!isMealPrepCategory("Śniadanie"));
    assert.ok(!isMealPrepCategory("Awaryjne"));
  });
});

describe("demand", () => {
  const meals = [meal("a"), meal("b"), meal("c"), meal("d")];

  test("plans two portions per day, split by day type", () => {
    const plan = buildPrepPlan({
      days: [
        { date: "2026-09-21", dayType: "DT" },
        { date: "2026-09-22", dayType: "DT" },
        { date: "2026-09-23", dayType: "DNT" },
      ],
      meals,
      targets: TARGETS,
    });
    assert.deepEqual(plan.needed, { DT: 4, DNT: 2 });
    const dt = plan.items.filter((i) => i.variant === "DT").reduce((n, i) => n + i.portions, 0);
    const dnt = plan.items.filter((i) => i.variant === "DNT").reduce((n, i) => n + i.portions, 0);
    assert.equal(dt, 4);
    assert.equal(dnt, 2);
    assert.equal(plan.short, false);
  });

  test("portions already in the fridge reduce what gets cooked", () => {
    const plan = buildPrepPlan({
      days: [
        { date: "2026-09-21", dayType: "DT" },
        { date: "2026-09-22", dayType: "DT" },
      ],
      meals,
      targets: TARGETS,
      fridge: [{ variant: "DT", count: 2 }],
    });
    assert.equal(plan.fromFridge.DT, 2);
    assert.equal(plan.items.reduce((n, i) => n + i.portions, 0), 2);
  });

  test("a fridge that already covers everything means nothing to cook", () => {
    const plan = buildPrepPlan({
      days: [{ date: "2026-09-21", dayType: "DT" }],
      meals,
      targets: TARGETS,
      fridge: [{ variant: "DT", count: 5 }],
    });
    assert.equal(plan.items.length, 0);
    assert.equal(plan.fromFridge.DT, 2);
  });
});

describe("choosing dishes", () => {
  test("reuses one dish across DT and DNT instead of picking two", () => {
    const plan = buildPrepPlan({
      days: [
        { date: "2026-09-21", dayType: "DT" },
        { date: "2026-09-22", dayType: "DNT" },
      ],
      meals: [meal("a"), meal("b")],
      targets: TARGETS,
    });
    assert.equal(plan.dishCount, 1);
    assert.deepEqual(plan.items.map((i) => i.variant).sort(), ["DNT", "DT"]);
  });

  test("never exceeds a dish's batch size in one go", () => {
    const small = [meal("small", { batch: "2" })];
    const plan = buildPrepPlan({
      days: [
        { date: "2026-09-21", dayType: "DT" },
        { date: "2026-09-22", dayType: "DT" },
      ],
      meals: small,
      targets: TARGETS,
    });
    for (const item of plan.items) assert.ok(item.portions <= 2, `${item.portions} > batch 2`);
  });

  test("skips meals that are not meal prep, and single-portion meals", () => {
    const plan = buildPrepPlan({
      days: [{ date: "2026-09-21", dayType: "DT" }],
      meals: [meal("breakfast", { category: "Śniadanie" }), meal("single", { batch: "1" }), meal("ok")],
      targets: TARGETS,
    });
    assert.deepEqual([...new Set(plan.items.map((i) => i.mealKey))], ["ok"]);
  });

  test("skips food that will not survive the span unless it freezes", () => {
    const shortLife = meal("short", { fridgeLife: "1 dzień", freezable: false });
    const plan = buildPrepPlan({
      days: [
        { date: "2026-09-21", dayType: "DT" },
        { date: "2026-09-22", dayType: "DT" },
        { date: "2026-09-23", dayType: "DT" },
      ],
      meals: [shortLife, meal("keeps")],
      targets: TARGETS,
    });
    assert.ok(!plan.items.some((i) => i.mealKey === "short"));
  });

  test("reports short when the library cannot cover the days", () => {
    const plan = buildPrepPlan({
      days: [{ date: "2026-09-21", dayType: "DT" }],
      meals: [meal("breakfast", { category: "Śniadanie" })],
      targets: TARGETS,
    });
    assert.equal(plan.short, true);
    assert.equal(plan.items.length, 0);
  });

  test("prefers the dish whose macros fit the target portion best", () => {
    const target = portionTarget(TARGETS.DT.kcal); // ~800 kcal
    const far = meal("far", { kcal: 400, protein_g: 30 });
    const close = meal("close", { kcal: Math.round(target), protein_g: 65 });
    const plan = buildPrepPlan({
      days: [{ date: "2026-09-21", dayType: "DT" }],
      meals: [far, close],
      targets: TARGETS,
    });
    assert.equal(plan.items[0].mealKey, "close");
  });

  test("is deterministic: same input, same plan", () => {
    const input = {
      days: [
        { date: "2026-09-21", dayType: "DT" as const },
        { date: "2026-09-22", dayType: "DNT" as const },
      ],
      meals: [meal("a"), meal("b"), meal("c")],
      targets: TARGETS,
    };
    assert.deepEqual(buildPrepPlan(input), buildPrepPlan(input));
  });
});

describe("swapping a dish", () => {
  const meals = [meal("a"), meal("b"), meal("c"), meal("d"), meal("e")];

  test("offers at most three alternatives", () => {
    const plan = buildPrepPlan({ days: [{ date: "2026-09-21", dayType: "DT" }], meals, targets: TARGETS });
    const options = swapAlternatives({
      item: plan.items[0],
      meals,
      targets: TARGETS,
      spanDays: 1,
      exclude: [],
    });
    assert.equal(options.length, 3);
  });

  test("never offers the dish being replaced, or one already in the plan", () => {
    const plan = buildPrepPlan({ days: [{ date: "2026-09-21", dayType: "DT" }], meals, targets: TARGETS });
    const current = plan.items[0];
    const options = swapAlternatives({
      item: current,
      meals,
      targets: TARGETS,
      spanDays: 1,
      exclude: ["b"],
    });
    const keys = options.map((o) => o.mealKey);
    assert.ok(!keys.includes(current.mealKey));
    assert.ok(!keys.includes("b"));
  });

  test("keeps the portion count of the dish it replaces", () => {
    const plan = buildPrepPlan({
      days: [
        { date: "2026-09-21", dayType: "DT" },
        { date: "2026-09-22", dayType: "DT" },
      ],
      meals,
      targets: TARGETS,
    });
    const options = swapAlternatives({ item: plan.items[0], meals, targets: TARGETS, spanDays: 2, exclude: [] });
    assert.equal(options[0].portions, plan.items[0].portions);
  });
});

describe("prep slots", () => {
  test("matches the sheet's own categories, diacritics and all", () => {
    assert.equal(matchesSlot("Śniadanie", "sniadanie"), true);
    assert.equal(matchesSlot("Meal prep", "obiad"), true);
    assert.equal(matchesSlot("Kolacja", "kolacja"), true);
    // A slot never borrows from another.
    assert.equal(matchesSlot("Meal prep", "sniadanie"), false);
    assert.equal(matchesSlot("Śniadanie", "obiad"), false);
    // "Awaryjne" belongs to no prep slot.
    assert.equal(matchesSlot("Awaryjne — NO COOK", "obiad"), false);
  });

  test("plans from the chosen slot only", () => {
    const meals = [
      meal("chicken-rice"),
      meal("oats", { category: "Śniadanie" }),
    ];
    const days = [{ date: "2026-09-17", dayType: "DT" as const }];

    const breakfast = buildPrepPlan({ days, meals, targets: TARGETS, slot: "sniadanie" });
    assert.deepEqual([...new Set(breakfast.items.map((item) => item.mealKey))], ["oats"]);

    const dinner = buildPrepPlan({ days, meals, targets: TARGETS, slot: "obiad" });
    assert.deepEqual([...new Set(dinner.items.map((item) => item.mealKey))], ["chicken-rice"]);
  });

  test("availableDishes lists the whole slot, uncapped and one row per dish", () => {
    const meals = Array.from({ length: 7 }, (_, index) => meal(`dish-${index}`));

    const all = availableDishes({ meals, targets: TARGETS, spanDays: 2, slot: "obiad" });
    assert.equal(all.length, 7, "every dish is offered, not just three");
    assert.equal(new Set(all.map((item) => item.mealKey)).size, 7, "no dish appears twice");
    // Portions default to one batch, as the sheet defines it.
    assert.equal(all[0].portions, 6);
  });

  test("availableDishes drops what is already in the plan", () => {
    const meals = [meal("a"), meal("b")];
    const rest = availableDishes({
      meals,
      targets: TARGETS,
      spanDays: 2,
      slot: "obiad",
      exclude: ["a"],
    });
    assert.deepEqual(rest.map((item) => item.mealKey), ["b"]);
  });
});
