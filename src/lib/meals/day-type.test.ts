import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { planVariantSwitch, type DishVariant, type SwitchableMeal } from "./day-type.ts";

const RICE: DishVariant[] = [
  { variant: "DT", kcal: 789, protein_g: 59, fat_g: 17, carbs_g: 100 },
  { variant: "DNT", kcal: 715, protein_g: 63, fat_g: 23, carbs_g: 64 },
];
const variantsOf = (key: string) => (key === "chicken-rice" ? RICE : []);

function meal(over: Partial<SwitchableMeal> = {}): SwitchableMeal {
  return { id: "a", status: "planned", source: "sheet", mealKey: "chicken-rice", variant: "DT", portions: 1, ...over };
}

describe("planVariantSwitch", () => {
  test("a planned DT dish becomes its DNT version", () => {
    assert.deepEqual(planVariantSwitch([meal()], "DNT", variantsOf), [
      { id: "a", variant: "DNT", kcal: 715, protein_g: 63, fat_g: 23, carbs_g: 64 },
    ]);
  });

  test("and back again", () => {
    assert.equal(planVariantSwitch([meal({ variant: "DNT" })], "DT", variantsOf)[0].kcal, 789);
  });

  test("meals already on the right version are left alone", () => {
    assert.deepEqual(planVariantSwitch([meal({ variant: "DNT" })], "DNT", variantsOf), []);
  });

  test("eaten, logged-by-hand and typed-in meals are history and stay as they are", () => {
    const meals = [
      meal({ id: "e", status: "eaten" }),
      meal({ id: "x", status: "adhoc" }),
      meal({ id: "m", source: "manual" }),
      meal({ id: "n", mealKey: null }),
    ];
    assert.deepEqual(planVariantSwitch(meals, "DNT", variantsOf), []);
  });

  test("a dish with no version for the new day type, or gone from the sheet, is kept", () => {
    assert.deepEqual(planVariantSwitch([meal({ mealKey: "gone" })], "DNT", variantsOf), []);
    assert.deepEqual(planVariantSwitch([meal()], "DNT", () => [RICE[0]]), []);
  });
});
