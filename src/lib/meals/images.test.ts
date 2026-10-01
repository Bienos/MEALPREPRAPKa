import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, test } from "node:test";

import { DISH_IMAGES, dishImageFor, mealImageSrc } from "./images.ts";

describe("dishImageFor", () => {
  test("matches the dish named in the meal, specific before broad", () => {
    assert.equal(dishImageFor("Chicken Pesto Pasta"), "pesto-pasta");
    assert.equal(dishImageFor("Turkey Pasta"), "tomato-pasta");
    assert.equal(dishImageFor("Tiramisu Overnight Oats"), "overnight-oats");
    assert.equal(dishImageFor("Chicken Burrito Bowl"), "mexican-bowl");
    assert.equal(dishImageFor("Breakfast Burrito"), "wrap");
    assert.equal(dishImageFor("Tuna Rice Bowl"), "tuna-rice");
    assert.equal(dishImageFor("Chicken Rice"), "rice-bowl");
  });

  test("reads Polish names regardless of diacritics", () => {
    assert.equal(dishImageFor("Tuńczyk + ryż microwave"), "tuna-rice");
    assert.equal(dishImageFor("Twaróg mini"), "twarog-bowl");
    assert.equal(dishImageFor("Jajka + pieczywo"), "eggs-toast");
  });

  test("falls back on the category, then on a rice bowl", () => {
    assert.equal(dishImageFor("Coś nowego", "Śniadanie"), "oats-bowl");
    assert.equal(dishImageFor("Coś nowego", "Kolacja"), "sandwich");
    assert.equal(dishImageFor("Coś nowego"), "rice-bowl");
  });

  test("every picture the rules can return exists on disk", () => {
    for (const image of DISH_IMAGES) {
      assert.ok(existsSync(new URL(`../../../public/food/${image}.svg`, import.meta.url)), image);
    }
    assert.equal(mealImageSrc("Chicken Rice"), "/food/rice-bowl.svg");
  });
});
