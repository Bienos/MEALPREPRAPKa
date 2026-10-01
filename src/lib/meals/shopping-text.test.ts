import assert from "node:assert/strict";
import { test } from "node:test";

import { shoppingText } from "./shopping-text.ts";

const row = (over: Partial<Parameters<typeof shoppingText>[0][number]>) => ({
  name: "ryż",
  quantity: 660,
  unit: "g",
  category: "carbs" as const,
  checked: false,
  owned: false,
  ...over,
});

test("groups what is left to buy by aisle", () => {
  const text = shoppingText([
    row({ name: "pierś z kurczaka", quantity: 1400, category: "meat" }),
    row({}),
    row({ name: "banany", quantity: 4, unit: "szt", category: "fruit" }),
  ]);
  assert.equal(text, "MIĘSO I RYBY\n- pierś z kurczaka 1,4 kg\n\nWĘGLOWODANY\n- ryż 660 g\n\nOWOCE\n- banany 4 szt");
});

test("leaves out what is already bought or at home, and says nothing when all is done", () => {
  const rows = [row({ checked: true }), row({ name: "sól", owned: true })];
  assert.equal(shoppingText(rows), "");
});

test("an item with no readable amount is listed by name alone", () => {
  assert.equal(shoppingText([row({ name: "przyprawa", quantity: null, unit: null })]), "WĘGLOWODANY\n- przyprawa");
});
