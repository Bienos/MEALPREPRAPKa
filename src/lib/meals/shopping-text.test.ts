import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { keepTicks, shoppingText } from "./shopping-text.ts";

const row = (over: Partial<Parameters<typeof shoppingText>[0][number]>) => ({
  name: "ryż",
  quantity: 660,
  unit: "g",
  category: "carbs" as const,
  checked: false,
  owned: false,
  ...over,
});

test("groups what is left to buy by aisle", () => {
  const text = shoppingText([
    row({ name: "pierś z kurczaka", quantity: 1400, category: "meat" }),
    row({}),
    row({ name: "banany", quantity: 4, unit: "szt", category: "fruit" }),
  ]);
  assert.equal(text, "MIĘSO I RYBY\n- pierś z kurczaka 1,4 kg\n\nWĘGLOWODANY\n- ryż 660 g\n\nOWOCE\n- banany 4 szt");
});

test("leaves out what is already bought or at home, and says nothing when all is done", () => {
  const rows = [row({ checked: true }), row({ name: "sól", owned: true })];
  assert.equal(shoppingText(rows), "");
});

test("an item with no readable amount is listed by name alone", () => {
  assert.equal(shoppingText([row({ name: "przyprawa", quantity: null, unit: null })]), "WĘGLOWODANY\n- przyprawa");
});

describe("rebuilding the list", () => {
  const line = (name: string, quantity: number | null, unit: string | null = "g") => ({ name, quantity, unit });

  test("keeps what was ticked when the amount did not grow", () => {
    const [rice, chicken] = keepTicks(
      [line("ryż", 300), line("kurczak", 900)],
      [
        { ...line("ryż", 300), checked: true, owned: false },
        { ...line("kurczak", 600), checked: true, owned: false },
      ],
    );
    assert.equal(rice.checked, true);
    // More chicken is needed now than was bought, so it is back on the list.
    assert.equal(chicken.checked, false);
  });

  test("keeps 'mam w domu' whatever the amount, and new items start unticked", () => {
    const [skyr, oats] = keepTicks(
      [line("Skyr", 1500), line("płatki", 400)],
      [{ ...line("skyr", 300), checked: false, owned: true }],
    );
    assert.equal(skyr.owned, true);
    assert.deepEqual([oats.checked, oats.owned], [false, false]);
  });
});
