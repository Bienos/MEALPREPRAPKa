import assert from "node:assert/strict";
import { test } from "node:test";

import { expiryLabel, expiryTone, isUrgent } from "./prep-view-types.ts";

test("how a portion's freshness reads", () => {
  assert.deepEqual([-1, 0, 1, 2, 5, null].map(expiryLabel), [
    "Po terminie",
    "Zjedz dziś",
    "Zjedz jutro",
    "Jeszcze 2 dni",
    "Jeszcze 5 dni",
    "Bez daty",
  ]);
});

test("tone: overdue and today are urgent, tomorrow is soon, the rest is fresh", () => {
  assert.deepEqual([-3, 0, 1, 2, 9, null].map(expiryTone), ["urgent", "urgent", "soon", "fresh", "fresh", "none"]);
  assert.equal(isUrgent(1), true);
  assert.equal(isUrgent(2), false);
});
