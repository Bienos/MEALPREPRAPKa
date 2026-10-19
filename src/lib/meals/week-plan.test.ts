import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { defaultWeekStart, portionsToBuy, weekDates, weekTarget, type WeekEntry } from "./week-plan.ts";

const TARGETS = {
  DT: { kcal: 2460, protein_g: 200, fat_g: 60, carbs_g: 280 },
  DNT: { kcal: 2360, protein_g: 220, fat_g: 80, carbs_g: 190 },
};

// Monday 19 October 2026.
const WEEK = weekDates("2026-10-19");

let ids = 0;
function entry(over: Partial<WeekEntry> & { date: string }): WeekEntry {
  ids += 1;
  return {
    id: `e${ids}`,
    mealKey: "oats",
    name: "Oats",
    variant: "DT",
    status: "planned",
    kind: "sniadanie",
    portions: 1,
    kcal: 700,
    protein_g: 60,
    fat_g: 15,
    carbs_g: 80,
    ...over,
  };
}


describe("which week", () => {
  test("a week runs Monday to Sunday", () => {
    assert.deepEqual(WEEK, [
      "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25",
    ]);
  });

  test("opens on this week, or next week on a Sunday", () => {
    assert.equal(defaultWeekStart("2026-10-19"), "2026-10-19");
    assert.equal(defaultWeekStart("2026-10-22"), "2026-10-19");
    assert.equal(defaultWeekStart("2026-10-24"), "2026-10-19");
    assert.equal(defaultWeekStart("2026-10-25"), "2026-10-26");
  });

  test("the target is each day's own target added up", () => {
    const target = weekTarget(["DT", "DT", "DNT"], TARGETS);
    assert.equal(target.kcal, 2460 * 2 + 2360);
    assert.equal(target.protein_g, 200 * 2 + 220);
  });
});

describe("shopping for the week", () => {
  test("buys what is still to eat, minus portions already in the fridge", () => {
    const entries = [
      entry({ date: "2026-10-19", status: "eaten" }),
      entry({ date: "2026-10-20", mealKey: "rice", variant: "DT" }),
      entry({ date: "2026-10-21", mealKey: "rice", variant: "DNT" }),
      entry({ date: "2026-10-22", mealKey: "rice", variant: "DT", portions: 1.5 }),
      entry({ date: "2026-10-22", mealKey: null, name: "Kebab", status: "adhoc" }),
    ];
    assert.deepEqual(portionsToBuy(entries, "2026-10-19", { rice: 1 }), [
      { mealKey: "rice", variant: "DNT", portions: 1 },
      { mealKey: "rice", variant: "DT", portions: 1.5 },
    ]);
  });

  test("skips days that are over", () => {
    const entries = [entry({ date: "2026-10-19" }), entry({ date: "2026-10-24" })];
    assert.equal(portionsToBuy(entries, "2026-10-20", {}).length, 1);
  });
});
