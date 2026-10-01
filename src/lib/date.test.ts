import assert from "node:assert/strict";
import { test } from "node:test";

import { addDays, daysBetween, relativeDayLabel } from "./date.ts";

test("daysBetween counts whole days across a month and a DST change", () => {
  assert.equal(daysBetween("2026-09-28", "2026-10-02"), 4);
  assert.equal(daysBetween("2026-10-02", "2026-09-28"), -4);
  assert.equal(daysBetween("2026-03-27", "2026-03-30"), 3);
  assert.equal(daysBetween("2026-10-01", "2026-10-01"), 0);
});

test("relativeDayLabel", () => {
  const today = "2026-10-01";
  assert.equal(relativeDayLabel(today, today), "Dziś");
  assert.equal(relativeDayLabel(addDays(today, 1), today), "Jutro");
  assert.equal(relativeDayLabel(addDays(today, 2), today), "Pojutrze");
  assert.equal(relativeDayLabel(addDays(today, -1), today), "Wczoraj");
  assert.equal(relativeDayLabel(addDays(today, -2), today), "Przedwczoraj");
  assert.equal(relativeDayLabel(addDays(today, 6), today), "Za 6 dni");
  assert.equal(relativeDayLabel(addDays(today, -9), today), "9 dni temu");
});
