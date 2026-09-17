import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildCookingSteps } from "./cooking-steps.ts";
import type { PrepItem } from "./prep-plan.ts";

function item(over: Partial<PrepItem> & { mealKey: string; portions: number }): PrepItem {
  return {
    mealName: over.mealKey,
    variant: "DT",
    kcal: 800,
    protein_g: 60,
    fat_g: 17,
    carbs_g: 100,
    ingredients: "Kurczak 200 g SUROWY; ryż 110 g SUCHY; oliwa 10 g",
    fridgeDays: 3,
    prepMinutes: 30,
    ...over,
  };
}

describe("cooking steps", () => {
  test("an empty plan has no steps", () => {
    assert.deepEqual(buildCookingSteps([]), []);
  });

  test("batches one component across every dish rather than per recipe", () => {
    const steps = buildCookingSteps([
      item({ mealKey: "chicken-rice", portions: 4 }),
      item({ mealKey: "chicken-rice", portions: 2, variant: "DNT", ingredients: "Kurczak 230 g; ryż 60 g" }),
    ]);
    const rice = steps.filter((step) => step.title.includes("ryż"));
    assert.equal(rice.length, 1, "rice should be cooked once, not per variant");
    assert.equal(rice[0].detail, "560 g"); // 110*4 + 60*2
    assert.equal(rice[0].title, "Ugotuj: ryż");
  });

  test("cooks carbs before meat, then finishes each dish", () => {
    const steps = buildCookingSteps([
      item({ mealKey: "a", portions: 4 }),
      item({ mealKey: "b", portions: 2, ingredients: "Indyk 220 g; makaron 110 g" }),
    ]);
    const titles = steps.map((step) => step.title);
    const rice = titles.findIndex((t) => t.includes("ryż"));
    const chicken = titles.findIndex((t) => t.includes("kurczak"));
    const finishA = titles.findIndex((t) => t === "Dokończ: a");
    assert.ok(rice < chicken, "carbs come before meat");
    assert.ok(chicken < finishA, "components come before finishing dishes");
  });

  test("ends with portioning, and labels only when both variants are cooked", () => {
    const mixed = buildCookingSteps([
      item({ mealKey: "a", portions: 4, variant: "DT" }),
      item({ mealKey: "a", portions: 2, variant: "DNT" }),
    ]);
    assert.equal(mixed.at(-1)?.title, "Oznacz pojemniki DT / DNT");
    assert.ok(mixed.at(-2)?.title === "Rozłóż do pojemników");
    assert.equal(mixed.at(-2)?.detail, "6 porcji");

    const single = buildCookingSteps([item({ mealKey: "a", portions: 4, variant: "DT" })]);
    assert.equal(single.at(-1)?.title, "Rozłóż do pojemników");
  });

  test("skips trivial amounts like a splash of oil", () => {
    const steps = buildCookingSteps([item({ mealKey: "a", portions: 2 })]);
    assert.ok(!steps.some((step) => step.title.includes("oliwa")));
  });

  test("stays short: a two-dish prep fits in a handful of steps", () => {
    const steps = buildCookingSteps([
      item({ mealKey: "a", portions: 4 }),
      item({ mealKey: "b", portions: 2, ingredients: "Indyk 220 g; makaron 110 g; passata 200 g" }),
    ]);
    assert.ok(steps.length <= 8, `${steps.length} steps is too many`);
    assert.equal(steps[0].title, "Wyjmij i odmierz składniki");
  });
});
