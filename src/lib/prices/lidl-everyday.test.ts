import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { LIDL_EVERYDAY } from "./lidl-everyday.ts";
import { relevantPromos } from "./match.ts";

describe("Lidl everyday prices", () => {
  test("each is a Lidl shelf price valid to the end of the leaflet, with a unique key", () => {
    assert.ok(LIDL_EVERYDAY.length > 40);
    assert.ok(LIDL_EVERYDAY.every((promo) => promo.shop === "lidl" && promo.shelf === true && promo.promoPrice > 0));
    assert.ok(LIDL_EVERYDAY.every((promo) => promo.validTo === "2026-12-31"));
    assert.equal(new Set(LIDL_EVERYDAY.map((promo) => promo.productKey)).size, LIDL_EVERYDAY.length);
  });

  test("the items on a list find them: rice, spaghetti, rapeseed oil, rye bread", () => {
    const find = (item: string, unit: "g" | "ml") =>
      relevantPromos([{ name: item, unit }], LIDL_EVERYDAY, []).map((promo) => promo.name);
    assert.ok(find("ryż", "g").some((name) => name.includes("Ryż biały")));
    assert.ok(find("makaron", "g").some((name) => name.includes("spaghetti")));
    assert.ok(find("olej rzepakowy", "ml").some((name) => name.includes("rzepakowy")));
  });
});
