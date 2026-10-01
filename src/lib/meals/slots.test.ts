import assert from "node:assert/strict";
import { test } from "node:test";

import { slotNameForCategory } from "./slots.ts";

test("sheet categories read as when you eat the meal", () => {
  assert.equal(slotNameForCategory("Śniadanie"), "Śniadanie");
  assert.equal(slotNameForCategory("Meal prep"), "Obiad");
  assert.equal(slotNameForCategory("Meal prep — AIR FRYER"), "Obiad");
  assert.equal(slotNameForCategory("Kolacja"), "Kolacja");
  assert.equal(slotNameForCategory("Przekąska / uzupełniacz"), "Przekąska");
  assert.equal(slotNameForCategory("Lekki posiłek 250–400"), "Przekąska");
  assert.equal(slotNameForCategory("Awaryjne — NO COOK"), "Posiłek");
});
