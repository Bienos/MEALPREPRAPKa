import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { columnLetter, planMealAppend, planMealEdit, type MealInput } from "./sheet-edit.ts";

const HEADER = ["Typ", "Danie", "Wersja", "Składniki i gramatura", "Kcal", "B (g)", "T (g)", "W (g)", "Czas", "Batch", "Lodówka", "Mrożenie", "Notatki"];

function sheet(): string[][] {
  return [
    HEADER,
    ["Śniadanie", "Overnight oats", "DT", "Płatki 80 g; skyr 250 g", "772", "66", "16", "91", "5 min", "3 słoiki", "3 dni", "Nie", "moja notatka"],
    ["Śniadanie", "Overnight oats", "DNT", "Płatki 50 g; skyr 300 g", "739", "70", "19", "72", "5 min", "3 słoiki", "3 dni", "Nie", ""],
    ["", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Meal prep", "Chicken Rice", "DT", "Kurczak 200 g; ryż 110 g", "789", "59", "17", "100", "25–30 min", "4–6", "2–3 dni", "Tak", ""],
  ];
}

function inputFrom(over: Partial<MealInput> = {}): MealInput {
  return {
    name: "Overnight oats",
    category: "Śniadanie",
    variant: "DT",
    ingredients: "Płatki 80 g; skyr 250 g",
    kcal: 772,
    protein_g: 66,
    fat_g: 16,
    carbs_g: 91,
    prepTime: "5 min",
    batch: "3 słoiki",
    fridgeLife: "3 dni",
    freezable: false,
    ...over,
  };
}

describe("planMealEdit", () => {
  test("an unchanged form writes nothing", () => {
    const plan = planMealEdit(sheet(), { mealKey: "overnight-oats", variant: "DT" }, inputFrom());
    assert.deepEqual(plan, { ok: true, mealKey: "overnight-oats", writes: [] });
  });

  test("changing calories writes only that cell of that variant's row", () => {
    const plan = planMealEdit(sheet(), { mealKey: "overnight-oats", variant: "DT" }, inputFrom({ kcal: 800 }));
    assert.deepEqual(plan, { ok: true, mealKey: "overnight-oats", writes: [{ row: 2, col: 4, value: 800 }] });
  });

  test("editing DNT never touches the DT row", () => {
    const plan = planMealEdit(
      sheet(),
      { mealKey: "overnight-oats", variant: "DNT" },
      inputFrom({ variant: "DNT", ingredients: "Płatki 50 g; skyr 300 g", kcal: 700, protein_g: 70, fat_g: 19, carbs_g: 72 }),
    );
    assert.ok(plan.ok);
    assert.deepEqual(plan.writes, [{ row: 3, col: 4, value: 700 }]);
  });

  test("a rename applies to every row of the dish and to nothing else", () => {
    const plan = planMealEdit(sheet(), { mealKey: "overnight-oats", variant: "DT" }, inputFrom({ name: "Nocna owsianka" }));
    assert.ok(plan.ok);
    assert.equal(plan.mealKey, "nocna-owsianka");
    assert.deepEqual(plan.writes, [
      { row: 2, col: 1, value: "Nocna owsianka" },
      { row: 3, col: 1, value: "Nocna owsianka" },
    ]);
  });

  test("columns the app does not know, like notes, are never written", () => {
    const plan = planMealEdit(sheet(), { mealKey: "overnight-oats", variant: "DT" }, inputFrom({ kcal: 1, batch: "x" }));
    assert.ok(plan.ok);
    assert.ok(plan.writes.every((write) => write.col !== 12));
  });

  test("an empty field matches the sheet's dash for no value", () => {
    const rows = sheet();
    rows[1][10] = "—";
    const plan = planMealEdit(rows, { mealKey: "overnight-oats", variant: "DT" }, inputFrom({ fridgeLife: "" }));
    assert.deepEqual(plan.ok && plan.writes, []);
  });

  test("an unrecognised freezing note survives a save", () => {
    const rows = sheet();
    rows[1][11] = "Częściowo";
    const plan = planMealEdit(rows, { mealKey: "overnight-oats", variant: "DT" }, inputFrom({ freezable: null }));
    assert.deepEqual(plan.ok && plan.writes, []);
  });

  test("finds the row by name even after the sheet was reordered", () => {
    const rows = sheet();
    rows.splice(1, 0, ["Kolacja", "Egg wrap", "DT", "Jajka", "500", "40", "20", "40", "", "", "", "", ""]);
    const plan = planMealEdit(rows, { mealKey: "overnight-oats", variant: "DT" }, inputFrom({ kcal: 800 }));
    assert.deepEqual(plan.ok && plan.writes, [{ row: 3, col: 4, value: 800 }]);
  });

  test("refuses when the meal or the variant is gone", () => {
    assert.equal(planMealEdit(sheet(), { mealKey: "nope", variant: "DT" }, inputFrom()).ok, false);
    assert.equal(planMealEdit(sheet(), { mealKey: "chicken-rice", variant: "DNT" }, inputFrom()).ok, false);
  });

  test("refuses a rename that would merge two dishes", () => {
    const plan = planMealEdit(sheet(), { mealKey: "overnight-oats", variant: "DT" }, inputFrom({ name: "Chicken rice" }));
    assert.equal(plan.ok, false);
  });

  test("refuses negative or missing numbers", () => {
    assert.equal(planMealEdit(sheet(), { mealKey: "overnight-oats", variant: "DT" }, inputFrom({ kcal: -5 })).ok, false);
    assert.equal(planMealEdit(sheet(), { mealKey: "overnight-oats", variant: "DT" }, inputFrom({ kcal: Number.NaN })).ok, false);
  });
});

describe("planMealAppend", () => {
  test("lays a new meal out by the sheet's own columns, after the last row", () => {
    const plan = planMealAppend(sheet(), inputFrom({ name: "Shakshuka", category: "Kolacja", variant: null, freezable: null }));
    assert.ok(plan.ok);
    assert.equal(plan.mealKey, "shakshuka");
    assert.equal(plan.afterRow, 5);
    assert.deepEqual(plan.row, ["Kolacja", "Shakshuka", "", "Płatki 80 g; skyr 250 g", 772, 66, 16, 91, "5 min", "3 słoiki", "3 dni", ""]);
  });

  test("a new variant of an existing dish keeps the dish's category", () => {
    const plan = planMealAppend(sheet(), inputFrom({ name: "Chicken Rice", category: "Kolacja", variant: "DNT" }));
    assert.ok(plan.ok);
    assert.equal(plan.row[0], "Meal prep");
  });

  test("refuses a variant that already exists", () => {
    assert.equal(planMealAppend(sheet(), inputFrom()).ok, false);
  });
});

test("columnLetter", () => {
  assert.equal(columnLetter(0), "A");
  assert.equal(columnLetter(11), "L");
  assert.equal(columnLetter(26), "AA");
});
