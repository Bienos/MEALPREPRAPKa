import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  dayForNewPortion,
  defaultWeekStart,
  entryToRemove,
  portionsToBuy,
  topUpPicks,
  weekDates,
  weekDishes,
  weekStatus,
  weekTarget,
  type Snack,
  type WeekEntry,
} from "./week-plan.ts";

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

function snack(mealKey: string, kcal: number, protein_g: number): Snack {
  return { mealKey, name: mealKey, variant: null, kcal, protein_g, fat_g: 2, carbs_g: 10 };
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

describe("matching the target", () => {
  const target = weekTarget(Array(7).fill("DT"), TARGETS); // 17 220 kcal

  test("within 3% counts as a match", () => {
    assert.equal(weekStatus({ ...target, kcal: target.kcal * 0.98 }, target), "ok");
    assert.equal(weekStatus({ ...target, kcal: target.kcal * 1.025 }, target), "ok");
  });

  test("outside it is under or over, and nothing yet is empty", () => {
    assert.equal(weekStatus({ ...target, kcal: target.kcal * 0.9 }, target), "under");
    assert.equal(weekStatus({ ...target, kcal: target.kcal * 1.1 }, target), "over");
    assert.equal(weekStatus({ ...target, kcal: 0 }, target), "empty");
  });
});

describe("placing a pick", () => {
  test("spreads one kind over the week, earliest day first", () => {
    const entries: WeekEntry[] = [];
    const placed: string[] = [];
    for (let i = 0; i < 9; i++) {
      const date = dayForNewPortion(WEEK, entries, "sniadanie", "2026-10-19")!;
      placed.push(date);
      entries.push(entry({ date }));
    }
    assert.deepEqual(placed, [...WEEK, "2026-10-19", "2026-10-20"]);
  });

  test("counts each kind on its own", () => {
    const entries = [entry({ date: "2026-10-19", kind: "obiad" })];
    assert.equal(dayForNewPortion(WEEK, entries, "sniadanie", "2026-10-19"), "2026-10-19");
    assert.equal(dayForNewPortion(WEEK, entries, "obiad", "2026-10-19"), "2026-10-20");
  });

  test("eaten food counts, so today's breakfast is not planned twice", () => {
    const entries = [entry({ date: "2026-10-21", status: "eaten" })];
    assert.equal(dayForNewPortion(WEEK, entries, "sniadanie", "2026-10-21"), "2026-10-22");
  });

  test("never plans a day that is over", () => {
    assert.equal(dayForNewPortion(WEEK, [], "kolacja", "2026-10-23"), "2026-10-23");
    assert.equal(dayForNewPortion(WEEK, [], "kolacja", "2026-10-26"), null);
  });
});

describe("taking a pick back", () => {
  test("removes the last portion of that dish still to eat", () => {
    const first = entry({ date: "2026-10-19" });
    const last = entry({ date: "2026-10-23" });
    const other = entry({ date: "2026-10-25", mealKey: "eggs" });
    assert.equal(entryToRemove([first, last, other], "oats", "2026-10-19"), last);
  });

  test("never removes eaten food or a past day", () => {
    const eaten = entry({ date: "2026-10-22", status: "eaten" });
    const past = entry({ date: "2026-10-19" });
    assert.equal(entryToRemove([past, eaten], "oats", "2026-10-21"), null);
  });
});

describe("the week's picks", () => {
  test("one row per dish, eaten portions included", () => {
    const dishes = weekDishes([
      entry({ date: "2026-10-19", status: "eaten" }),
      entry({ date: "2026-10-20" }),
      entry({ date: "2026-10-20", mealKey: "rice", name: "Rice", kind: "obiad" }),
      entry({ date: "2026-10-21", status: "skipped" }),
      entry({ date: "2026-10-21", mealKey: null, name: "Kebab", kind: null, status: "adhoc" }),
    ]);
    assert.deepEqual(
      dishes.map((dish) => [dish.mealKey, dish.count, dish.eaten]),
      [["oats", 2, 1], ["rice", 1, 0]],
    );
  });
});

describe("topping up with snacks", () => {
  const dayTypes = Object.fromEntries(WEEK.map((date) => [date, "DT" as const]));
  const snacks = { DT: [snack("shake", 120, 24), snack("skyr-pb", 220, 26), snack("light", 330, 40)], DNT: [] };
  // Every day 2 160 kcal planned: 300 short of the 2 460 target.
  const fullWeek = WEEK.map((date) => entry({ date, kcal: 2160, protein_g: 170 }));

  test("closes each day's gap with the snack that fits best, one day at a time", () => {
    const picks = topUpPicks({ dates: WEEK, dayTypes, entries: fullWeek, targets: TARGETS, snacks, today: WEEK[0] });
    assert.ok(picks.every((pick) => pick.snack.mealKey === "light"));
    assert.equal(new Set(picks.map((pick) => pick.date)).size, picks.length);
    // 2 100 kcal short: six snacks of 330 leave 120, which is close enough.
    assert.equal(picks.length, 6);
  });

  test("stops once the week is close enough, so a big day elsewhere counts", () => {
    // Monday is 1 500 kcal over, which covers most of the other days' gaps.
    const entries = fullWeek.map((day, index) => (index === 0 ? { ...day, kcal: 3960 } : day));
    const picks = topUpPicks({ dates: WEEK, dayTypes, entries, targets: TARGETS, snacks, today: WEEK[0] });
    const added = picks.reduce((sum, pick) => sum + pick.snack.kcal, 0);
    assert.ok(added <= 300 + 60, `added ${added} kcal for a 300 kcal gap`);
    assert.ok(!picks.some((pick) => pick.date === WEEK[0]));
  });

  test("leaves empty days and past days alone", () => {
    const entries = [entry({ date: WEEK[0], kcal: 2160 }), entry({ date: WEEK[3], kcal: 2160 })];
    const picks = topUpPicks({ dates: WEEK, dayTypes, entries, targets: TARGETS, snacks, today: WEEK[1] });
    assert.deepEqual([...new Set(picks.map((pick) => pick.date))], [WEEK[3]]);
  });

  test("adds at most two snacks to a day", () => {
    const entries = [entry({ date: WEEK[0], kcal: 700 })];
    const picks = topUpPicks({ dates: WEEK, dayTypes, entries, targets: TARGETS, snacks, today: WEEK[0] });
    assert.equal(picks.length, 2);
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
