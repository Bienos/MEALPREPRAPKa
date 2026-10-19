import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { parseCsv } from "../google-sheets/csv.ts";
import { parseMealRows } from "./parse.ts";
import { batchBlocks, fitsTarget, planWeek, readyDayFromKey, readyDayLabel, readyDays } from "./ready-days.ts";
import { kindOfCategory } from "./slots.ts";

/** The real meal sheet on 19.10.2026, exported as CSV. */
const { meals } = parseMealRows(
  parseCsv(readFileSync(new URL("./test-data/sheet-2026-10-19.csv", import.meta.url), "utf8")),
);
const targets = {
  DT: { kcal: 2460, protein_g: 200, fat_g: 60, carbs_g: 280 },
  DNT: { kcal: 2360, protein_g: 220, fat_g: 80, carbs_g: 190 },
};
const categoryOf = (mealKey: string) => meals.find((meal) => meal.key === mealKey)!.category;

describe("readyDays", () => {
  for (const dayType of ["DT", "DNT"] as const) {
    test(`${dayType}: five varied days that all hit the target`, () => {
      const days = readyDays(meals, dayType, targets[dayType]);
      assert.equal(days.length, 5);
      for (const day of days) {
        assert.ok(day.fits, readyDayLabel(day.items));
        assert.ok(Math.abs(day.total.kcal - targets[dayType].kcal) <= targets[dayType].kcal * 0.03);
        assert.ok(day.total.protein_g >= targets[dayType].protein_g * 0.95);
        assert.equal(day.dayType, dayType);
      }
      assert.equal(new Set(days.map((day) => day.breakfastKey)).size, 5);
      assert.equal(new Set(days.map((day) => day.mainKey)).size, 5);
      assert.ok(days.every((day, index) => index === 0 || days[index - 1].score <= day.score));
    });
  }

  test("a day is breakfast, a meal prep, a second portion or a supper, and at most two snacks", () => {
    for (const day of readyDays(meals, "DT", targets.DT, { count: 5 })) {
      const kinds = day.items.map((entry) => kindOfCategory(categoryOf(entry.mealKey)));
      assert.equal(kinds.filter((kind) => kind === "sniadanie").length, 1);
      assert.ok(kinds.filter((kind) => kind === "obiad").length >= 1);
      assert.ok(kinds.filter((kind) => kind === "przekaska").length <= 2);
      assert.ok(!kinds.includes("inne"), "emergency meals are not planned");
      assert.deepEqual(day.items[0].slot, "Śniadanie");
      assert.deepEqual(day.items[1].slot, "Posiłek 2");
      assert.ok(["Posiłek 3", "Kolacja"].includes(day.items[day.items.length - 1].slot));
      assert.ok(day.items.every((entry) => entry.variant === "DT" || entry.variant === null));
    }
  });

  test("limited to one meal-prep dish, two portions a day", () => {
    const days = readyDays(meals, "DNT", targets.DNT, { mainKey: "chicken-rice", batchOnly: true, count: 3 });
    assert.equal(days.length, 3);
    for (const day of days) {
      assert.equal(day.items.filter((entry) => entry.mealKey === "chicken-rice").length, 2);
      assert.ok(fitsTarget(day.total, targets.DNT));
    }
  });
});

describe("readyDayFromKey", () => {
  test("rebuilds the same day from its key, for the server to write", () => {
    const [day] = readyDays(meals, "DT", targets.DT);
    const rebuilt = readyDayFromKey(meals, day.key, "DT", targets.DT);
    assert.ok(rebuilt);
    assert.deepEqual(rebuilt.items, day.items);
    assert.deepEqual(rebuilt.total, day.total);
  });

  test("uses the day's own version of each dish", () => {
    const [day] = readyDays(meals, "DT", targets.DT);
    const asDnt = readyDayFromKey(meals, day.key, "DNT", targets.DNT);
    assert.ok(asDnt);
    assert.ok(asDnt.items.every((entry) => entry.variant === "DNT" || entry.variant === null));
  });

  test("a dish that left the sheet, or a key in the wrong shape, gives nothing", () => {
    assert.equal(readyDayFromKey(meals, "overnight-oats|no-such-dish|no-such-dish|", "DT", targets.DT), null);
    assert.equal(readyDayFromKey(meals, "overnight-oats", "DT", targets.DT), null);
    // A supper in the main's place is not a valid day either.
    assert.equal(readyDayFromKey(meals, "overnight-oats|egg-wrap|egg-wrap|", "DT", targets.DT), null);
  });
});

describe("batchBlocks", () => {
  test("blocks of at most three days, as even as possible", () => {
    assert.deepEqual(batchBlocks(0), []);
    assert.deepEqual(batchBlocks(1), [1]);
    assert.deepEqual(batchBlocks(3), [3]);
    assert.deepEqual(batchBlocks(4), [2, 2]);
    assert.deepEqual(batchBlocks(5), [3, 2]);
    assert.deepEqual(batchBlocks(7), [3, 2, 2]);
  });
});

describe("planWeek", () => {
  const dates = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
  const week = dates.map((date, index) => ({ date, dayType: index % 2 === 0 ? ("DT" as const) : ("DNT" as const) }));

  test("every day hits its target, one meal-prep dish per block of days", () => {
    const plan = planWeek(meals, week, targets);
    assert.deepEqual(
      plan.map((entry) => entry.date),
      dates,
    );
    assert.ok(plan.every((entry) => entry.day.fits));
    assert.ok(plan.every((entry) => entry.day.items.filter((item) => item.mealKey === entry.day.mainKey).length === 2));

    const mains = plan.map((entry) => entry.day.mainKey);
    assert.equal(new Set(mains.slice(0, 3)).size, 1, "Mon–Wed share one batch");
    assert.equal(new Set(mains.slice(3, 5)).size, 1, "Thu–Fri share one batch");
    assert.equal(new Set(mains.slice(5, 7)).size, 1, "Sat–Sun share one batch");
    assert.equal(new Set([mains[0], mains[3], mains[5]]).size, 3, "each batch a different dish");
  });

  test("breakfast changes from one day to the next", () => {
    const plan = planWeek(meals, week, targets);
    for (let index = 1; index < plan.length; index++) {
      assert.notEqual(plan[index].day.breakfastKey, plan[index - 1].day.breakfastKey);
    }
  });

  test("a day already planned splits the batches around it", () => {
    const withGap = week.filter((day) => day.date !== "2026-10-21");
    const plan = planWeek(meals, withGap, targets);
    assert.equal(plan.length, 6);
    assert.equal(plan[0].day.mainKey, plan[1].day.mainKey, "Mon–Tue");
    assert.notEqual(plan[1].day.mainKey, plan[2].day.mainKey, "Thu starts a new batch");
  });
});

describe("readyDayLabel", () => {
  test("counts a dish eaten twice", () => {
    assert.equal(
      readyDayLabel([
        { mealKey: "a", name: "Overnight oats" },
        { mealKey: "b", name: "Chicken Rice" },
        { mealKey: "c", name: "Whey shake" },
        { mealKey: "b", name: "Chicken Rice" },
      ]),
      "Overnight oats · Chicken Rice ×2 · Whey shake",
    );
  });
});
