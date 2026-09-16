import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { MealSheetFormatError, normalizeHeader, parseMealRows, resolveColumns, slugify } from "./parse.ts";

const HEADER = ["Typ", "Danie", "Wersja", "Składniki i gramatura", "Kcal", "B (g)", "T (g)", "W (g)", "Czas", "Batch", "Lodówka", "Mrożenie"];

describe("header resolution", () => {
  test("normalizes Polish letters, case and punctuation", () => {
    assert.equal(normalizeHeader("Składniki i gramatura"), "skladniki i gramatura");
    assert.equal(normalizeHeader("B (g)"), "b g");
    assert.equal(normalizeHeader("  Łódka "), "lodka");
  });

  test("resolves columns in any order and via aliases", () => {
    const columns = resolveColumns(["Kcal", "Białko", "Nazwa", "Tłuszcz", "Węglowodany", "Kategoria", "Mrożenie", "Składniki (na porcję)"]);
    assert.equal(columns.kcal, 0);
    assert.equal(columns.protein, 1);
    assert.equal(columns.name, 2);
    assert.equal(columns.fat, 3);
    assert.equal(columns.carbs, 4);
    assert.equal(columns.category, 5);
    assert.equal(columns.freezable, 6);
    assert.equal(columns.ingredients, 7);
    assert.equal(columns.variant, null);
  });

  test("skips title rows above the header", () => {
    const library = parseMealRows([
      ["PLAN MEAL PREP", "", ""],
      [],
      HEADER,
      ["Kolacja", "Egg wrap", "—", "jajka", "545", "45", "21", "44", "10 min", "1", "1 dzień", "Nie"],
    ]);
    assert.equal(library.meals.length, 1);
    assert.equal(library.meals[0].variants[0].row, 4);
  });

  test("throws a clear error when required columns are missing", () => {
    assert.throws(() => parseMealRows([["Typ", "Danie", "Kcal"], ["x", "y", "1"]]), MealSheetFormatError);
  });
});

describe("row parsing", () => {
  const rows = [
    HEADER,
    ["Meal prep", "Chicken Rice", "DT", "Kurczak 200 g; ryż 110 g", "789", "59", "17", "100", "25–30 min", "4–6", "2–3 dni", "Tak"],
    ["Meal prep", "Chicken Rice", "DNT", "Kurczak 230 g; ryż 60 g", "715", "63", "23", "64", "25–30 min", "4–6", "2–3 dni", "Tak"],
    [],
    ["", "", "", "", "", "", "", "", "", "", "", ""],
    ["Kolacja", " Egg wrap ", "—", "jajka; tortilla", " 545 ", "45,5", "21", "44", "10 min", "1", "—", "Nie"],
    ["Awaryjne", "Zepsuty", "DT", "coś", "dużo", "40", "10", "50", "5 min", "1", "—", "Nie"],
    ["Awaryjne", "", "", "", "100", "1", "1", "1", "", "", "", ""],
  ];
  const library = parseMealRows(rows);

  test("groups DT and DNT rows of the same dish into one meal", () => {
    const chicken = library.meals.find((meal) => meal.key === "chicken-rice");
    assert.ok(chicken);
    assert.deepEqual(chicken.variants.map((v) => v.variant), ["DT", "DNT"]);
    assert.deepEqual(chicken.variants.map((v) => v.key), ["chicken-rice:dt", "chicken-rice:dnt"]);
    assert.equal(chicken.variants[0].kcal, 789);
    assert.equal(chicken.variants[1].carbs_g, 64);
    assert.equal(chicken.variants[0].freezable, true);
    assert.equal(chicken.variants[0].ingredients, "Kurczak 200 g; ryż 110 g");
  });

  test("keeps neutral meals with a single null variant, trims text, accepts decimal commas and dashes", () => {
    const wrap = library.meals.find((meal) => meal.key === "egg-wrap");
    assert.ok(wrap);
    assert.equal(wrap.name, "Egg wrap");
    assert.equal(wrap.variants.length, 1);
    assert.equal(wrap.variants[0].variant, null);
    assert.equal(wrap.variants[0].key, "egg-wrap:base");
    assert.equal(wrap.variants[0].kcal, 545);
    assert.equal(wrap.variants[0].protein_g, 45.5);
    assert.equal(wrap.variants[0].fridgeLife, null);
    assert.equal(wrap.variants[0].freezable, false);
  });

  test("ignores empty rows and flags malformed ones without dropping the rest", () => {
    assert.equal(library.meals.length, 2);
    assert.equal(library.issues.length, 2);
    assert.equal(library.issues[0].row, 7);
    assert.equal(library.issues[0].name, "Zepsuty");
    assert.match(library.issues[0].problems[0], /kcal: musi być liczbą/);
    assert.equal(library.issues[1].row, 8);
    assert.match(library.issues[1].problems[0], /brak nazwy/);
  });

  test("lists categories in sheet order", () => {
    assert.deepEqual(library.categories, ["Meal prep", "Kolacja"]);
  });

  test("flags duplicate variants and category conflicts", () => {
    const dup = parseMealRows([
      HEADER,
      ["Kolacja", "Wrap", "DT", "", "1", "1", "1", "1", "", "", "", ""],
      ["Śniadanie", "Wrap", "DT", "", "2", "2", "2", "2", "", "", "", ""],
    ]);
    assert.equal(dup.meals.length, 1);
    assert.equal(dup.meals[0].variants.length, 1);
    assert.equal(dup.issues.length, 2);
  });

  test("reports unknown variant values instead of guessing", () => {
    const bad = parseMealRows([HEADER, ["Kolacja", "Wrap", "XYZ", "", "1", "1", "1", "1", "", "", "", ""]]);
    assert.equal(bad.meals.length, 0);
    assert.match(bad.issues[0].problems[0], /nieznana wersja/);
  });
});

test("slugify handles Polish characters", () => {
  assert.equal(slugify("Twaróg Sweet Bowl"), "twarog-sweet-bowl");
  assert.equal(slugify("  Jajka + pieczywo "), "jajka-pieczywo");
});
