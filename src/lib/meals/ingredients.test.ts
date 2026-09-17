import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  aggregateIngredients,
  categorize,
  formatAmount,
  normalizeName,
  parseIngredient,
  parseIngredients,
} from "./ingredients.ts";

describe("parsing one fragment", () => {
  test("reads name, amount and unit", () => {
    assert.deepEqual(parseIngredient("ryż 110 g SUCHY"), {
      name: "ryż",
      quantity: 110,
      unit: "g",
      raw: "ryż 110 g SUCHY",
    });
  });

  test("takes the last amount so percentages in the name survive", () => {
    const parsed = parseIngredient("Wołowina 5% 200 g SUROWA");
    assert.equal(parsed.name, "wołowina 5%");
    assert.equal(parsed.quantity, 200);
  });

  test("converts kilograms and litres to the base unit", () => {
    assert.equal(parseIngredient("kurczak 1,2 kg").quantity, 1200);
    assert.equal(parseIngredient("mleko 1 l").quantity, 1000);
  });

  test("ignores parenthetical notes", () => {
    const parsed = parseIngredient("3 jajka (~180 g)");
    assert.equal(parsed.name, "jajka");
    assert.equal(parsed.quantity, 3);
    assert.equal(parsed.unit, "szt");
  });

  test("keeps an unreadable fragment as raw text with no amount", () => {
    assert.deepEqual(parseIngredient("curry"), {
      name: "curry",
      quantity: null,
      unit: null,
      raw: "curry",
    });
  });

  test("does not mistake a word starting with a unit letter for a unit", () => {
    const parsed = parseIngredient("miód 15 gramów");
    assert.equal(parsed.quantity, null);
  });
});

test("splits the sheet's semicolon list", () => {
  const parsed = parseIngredients("Kurczak 200 g SUROWY; ryż 110 g SUCHY; oliwa 10 g");
  assert.deepEqual(parsed.map((p) => p.name), ["kurczak", "ryż", "oliwa"]);
  assert.deepEqual(parsed.map((p) => p.quantity), [200, 110, 10]);
});

test("normalizeName drops preparation notes so amounts merge", () => {
  assert.equal(normalizeName("Kurczak SUROWY"), "kurczak");
  assert.equal(normalizeName("Ryż SUCHY"), "ryż");
  assert.equal(normalizeName("Tuńczyk odsączony"), "tuńczyk");
});

describe("categories", () => {
  test("sorts real ingredients into shopping groups", () => {
    assert.equal(categorize("pierś z kurczaka"), "meat");
    assert.equal(categorize("tuńczyk"), "meat");
    assert.equal(categorize("skyr"), "dairy");
    assert.equal(categorize("jajka"), "dairy");
    assert.equal(categorize("ryż"), "carbs");
    assert.equal(categorize("ziemniaki"), "carbs");
    assert.equal(categorize("warzywa / mieszanka"), "vegetables");
    assert.equal(categorize("passata"), "vegetables");
    assert.equal(categorize("banan"), "fruit");
    assert.equal(categorize("oliwa"), "other");
  });

  test("coconut milk is not dairy", () => {
    assert.equal(categorize("mleko kokosowe"), "other");
    assert.equal(categorize("mleko"), "dairy");
  });
});

describe("aggregation across meals and portions", () => {
  const entries = [
    { text: "Kurczak 200 g SUROWY; ryż 110 g SUCHY; oliwa 10 g", portions: 4 },
    { text: "Kurczak 230 g SUROWY; ryż 60 g SUCHY; oliwa 15 g", portions: 2 },
  ];

  test("sums the same ingredient instead of repeating it", () => {
    const totals = aggregateIngredients(entries);
    const chicken = totals.find((item) => item.name === "kurczak");
    assert.equal(chicken?.quantity, 200 * 4 + 230 * 2);
    assert.equal(chicken?.category, "meat");
    assert.equal(totals.filter((item) => item.name === "kurczak").length, 1);
  });

  test("returns one row per ingredient, grouped by category order", () => {
    const totals = aggregateIngredients(entries);
    assert.deepEqual(totals.map((item) => item.name), ["kurczak", "ryż", "oliwa"]);
  });

  test("keeps amount-less ingredients without inventing a number", () => {
    const totals = aggregateIngredients([{ text: "kurczak 100 g; curry", portions: 3 }]);
    const curry = totals.find((item) => item.name === "curry");
    assert.equal(curry?.quantity, null);
  });
});

describe("formatting", () => {
  test("switches to kilograms above 1000 g", () => {
    assert.equal(formatAmount(1660, "g"), "1,66 kg");
    assert.equal(formatAmount(620, "g"), "620 g");
    assert.equal(formatAmount(1000, "ml"), "1 l");
  });

  test("returns null when there is no amount to show", () => {
    assert.equal(formatAmount(null, null), null);
  });
});
