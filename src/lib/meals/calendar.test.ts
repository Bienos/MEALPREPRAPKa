import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildDays, buildMonth, gridBounds, monthBounds, shiftMonth, toneFor, type CalendarEntry } from "./calendar.ts";

const TARGETS = {
  DT: { kcal: 2460, protein_g: 200, fat_g: 60, carbs_g: 280 },
  DNT: { kcal: 2360, protein_g: 220, fat_g: 80, carbs_g: 190 },
};

function entry(date: string, kcal: number, status = "eaten", protein_g = 100): CalendarEntry {
  return { plan_date: date, status, kcal, protein_g, fat_g: 0, carbs_g: 0 };
}

function build(entries: CalendarEntry[], over: Partial<Parameters<typeof buildMonth>[0]> = {}) {
  return buildMonth({
    month: "2026-10",
    today: "2026-10-15",
    entries,
    dayTypes: {},
    cookedOn: new Set(),
    targets: TARGETS,
    defaultDayType: "DT",
    ...over,
  });
}

const flat = (m: ReturnType<typeof build>) => m.weeks.flat();
const cell = (m: ReturnType<typeof build>, date: string) => flat(m).find((c) => c.date === date)!;

describe("month grid", () => {
  test("October 2026 runs Monday 28 September to Sunday 1 November", () => {
    assert.deepEqual(gridBounds("2026-10"), { from: "2026-09-28", to: "2026-11-01" });
    const month = build([]);
    assert.equal(month.weeks.length, 5);
    assert.ok(month.weeks.every((week) => week.length === 7));
    assert.equal(month.weeks[0][0].date, "2026-09-28");
    assert.equal(month.weeks[0][0].inMonth, false);
    assert.equal(cell(month, "2026-10-01").inMonth, true);
  });

  test("a month that starts on a Monday and a leap February", () => {
    assert.deepEqual(gridBounds("2026-06"), { from: "2026-06-01", to: "2026-07-05" });
    assert.deepEqual(monthBounds("2028-02"), { first: "2028-02-01", last: "2028-02-29" });
  });

  test("shiftMonth crosses years", () => {
    assert.equal(shiftMonth("2026-12", 1), "2027-01");
    assert.equal(shiftMonth("2026-01", -1), "2025-12");
  });

  test("marks today and the future", () => {
    const month = build([]);
    assert.equal(cell(month, "2026-10-15").isToday, true);
    assert.equal(cell(month, "2026-10-16").isFuture, true);
    assert.equal(cell(month, "2026-10-14").isFuture, false);
  });
});

describe("a day's numbers", () => {
  test("a finished day adds up what was eaten, including food logged outside the plan", () => {
    const month = build([entry("2026-10-10", 800), entry("2026-10-10", 900, "adhoc"), entry("2026-10-10", 500, "planned")]);
    assert.equal(cell(month, "2026-10-10").kcal, 1700);
  });

  test("a future day adds up what is planned, but not what was skipped", () => {
    const month = build([entry("2026-10-20", 800, "planned"), entry("2026-10-20", 500, "skipped")]);
    assert.equal(cell(month, "2026-10-20").kcal, 800);
  });

  test("the target follows the day's own type", () => {
    const month = build([entry("2026-10-10", 2360)], { dayTypes: { "2026-10-10": "DNT" } });
    assert.equal(cell(month, "2026-10-10").tone, "ok");
    assert.equal(cell(month, "2026-10-10").fill, 1);
  });

  test("tone: too little, about right, too much", () => {
    assert.equal(toneFor(1500, 2460), "low");
    assert.equal(toneFor(2400, 2460), "ok");
    assert.equal(toneFor(2800, 2460), "high");
  });

  test("today is still in progress, so it has no verdict, and neither does an empty day", () => {
    const month = build([entry("2026-10-15", 300)]);
    assert.equal(cell(month, "2026-10-15").tone, null);
    assert.equal(cell(month, "2026-10-15").kcal, 300);
    assert.equal(cell(month, "2026-10-12").tone, null);
  });

  test("the bar never outgrows its cell", () => {
    assert.equal(cell(build([entry("2026-10-10", 9000)]), "2026-10-10").fill, 1.3);
  });

  test("flags days with entries and days a prep was cooked", () => {
    const month = build([entry("2026-10-10", 800)], { cookedOn: new Set(["2026-10-11"]) });
    assert.equal(cell(month, "2026-10-10").hasEntries, true);
    assert.equal(cell(month, "2026-10-12").hasEntries, false);
    assert.equal(cell(month, "2026-10-11").cooked, true);
  });
});

describe("month stats", () => {
  test("average only over finished, logged days of this month", () => {
    const month = build([
      entry("2026-10-10", 2400, "eaten", 190),
      entry("2026-10-11", 2000, "eaten", 150),
      entry("2026-10-15", 500), // today: not finished
      entry("2026-09-30", 3000), // shown in the grid but another month
    ]);
    assert.deepEqual(month.stats, { loggedDays: 2, avgKcal: 2200, avgProtein: 170, onTargetDays: 1 });
  });

  test("an empty month averages to zero rather than dividing by it", () => {
    assert.deepEqual(build([]).stats, { loggedDays: 0, avgKcal: 0, avgProtein: 0, onTargetDays: 0 });
  });
});

describe("a run of days (the strip on Today)", () => {
  test("covers exactly the range, and an unplanned day shows the default type", () => {
    const days = buildDays({
      from: "2026-10-13",
      to: "2026-10-19",
      today: "2026-10-15",
      entries: [entry("2026-10-14", 2400), entry("2026-10-17", 700, "planned")],
      dayTypes: { "2026-10-17": "DNT" },
      cookedOn: new Set(),
      targets: TARGETS,
      defaultDayType: "DT",
    });
    assert.deepEqual(days.map((d) => d.date.slice(8)), ["13", "14", "15", "16", "17", "18", "19"]);
    assert.ok(days.every((d) => d.inMonth));
    assert.equal(days[1].tone, "ok");
    assert.equal(days[4].effectiveType, "DNT");
    assert.equal(days[4].hasEntries, true);
    assert.equal(days[5].effectiveType, "DT");
    assert.equal(days[5].dayType, null);
  });
});
