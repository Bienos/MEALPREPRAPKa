import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { canonicalGtin, cleanGtin, displayGtin, hasPolishPrefix, isRestrictedGtin, isValidGtin } from "./gtin.ts";
import { formatGrosz, multiplyGrosz, parseZlotyText, sumGrosz, toGrosz } from "./money.ts";
import {
  APP_USE,
  PROVIDERS,
  authorizationFor,
  grantsVerifiedPrices,
  ingestionAllowed,
  providerById,
  providerForKey,
} from "./providers.ts";
import { RETAILERS, retailerForOsm, retailerForShop } from "./retailers.ts";
import { convert, parseQuantity, purchaseFor, unitPrice, unitPriceLabel } from "./units.ts";

describe("money in grosz", () => {
  test("złoty become whole grosz and sums stay exact", () => {
    assert.equal(toGrosz(12.99), 1299);
    assert.equal(toGrosz(0.1) + toGrosz(0.2), 30);
    assert.equal(sumGrosz([toGrosz(4.99), toGrosz(4.99), toGrosz(4.99)]), 1497);
    assert.throws(() => toGrosz(Number.NaN));
  });

  test("a weighed line rounds like the till", () => {
    // 0,834 kg at 23,99 zł/kg = 20,0076 -> 20,01 zł
    assert.equal(multiplyGrosz(2399, 0.834), 2001);
  });

  test("Polish price text", () => {
    assert.equal(parseZlotyText("12,99 zł"), 1299);
    assert.equal(parseZlotyText("Cena: 1 299,00 zł"), 129900);
    assert.equal(parseZlotyText("RABAT -0,50"), -50);
    assert.equal(parseZlotyText("brak"), null);
    assert.equal(formatGrosz(1299), "12,99 zł");
    assert.equal(formatGrosz(5), "0,05 zł");
  });
});

describe("GTIN", () => {
  test("check digits of real codes", () => {
    assert.ok(isValidGtin("5900820027834")); // Mlekpol Protein+ Twarożek
    assert.ok(isValidGtin("5905784329192")); // Carrefour Mleko UHT 0.5%
    assert.ok(isValidGtin("20482077")); // Lidl's own EAN-8
    assert.ok(!isValidGtin("5900820027835"));
    assert.ok(!isValidGtin("59008200278")); // 11 digits: no GTIN has that length
    assert.equal(cleanGtin("590 0820-027834"), "5900820027834");
  });

  test("one canonical form, shown back as people know it", () => {
    assert.equal(canonicalGtin("5900820027834"), "05900820027834");
    assert.equal(canonicalGtin("05900820027834"), "05900820027834");
    assert.equal(canonicalGtin("20482077"), "00000020482077");
    assert.equal(canonicalGtin("5900820027835"), null);
    assert.equal(displayGtin("05900820027834"), "5900820027834");
    assert.equal(displayGtin("00000020482077"), "20482077");
  });

  test("in-store codes are not a product identity; 590 is a registration prefix", () => {
    assert.ok(isRestrictedGtin(canonicalGtin("20482077")!));
    assert.ok(isRestrictedGtin(canonicalGtin("2050401947440")!)); // weighed item from Open Prices
    assert.ok(!isRestrictedGtin(canonicalGtin("5900820027834")!));
    assert.ok(hasPolishPrefix(canonicalGtin("5900820027834")!));
    assert.ok(!hasPolishPrefix(canonicalGtin("8011795106008")!));
  });
});

describe("units and packs", () => {
  test("pack sizes from product text", () => {
    assert.deepEqual(parseQuantity("Jajka 6 szt."), { amount: 6, unit: "szt" });
    assert.deepEqual(parseQuantity("Jaja L z wolnego wybiegu, 10 jaj"), { amount: 10, unit: "szt" });
    assert.deepEqual(parseQuantity("Pierś z kurczaka 800 g"), { amount: 800, unit: "g" });
    assert.deepEqual(parseQuantity("Ryż basmati 4 x 100 g"), { amount: 400, unit: "g" });
    assert.deepEqual(parseQuantity("Oliwa z oliwek 0,5 l"), { amount: 500, unit: "ml" });
    assert.deepEqual(parseQuantity("Ziemniaki 2,5 kg"), { amount: 2500, unit: "g" });
    assert.equal(parseQuantity("Banany luz"), null);
  });

  test("grams and millilitres convert only as an approximation; pieces never", () => {
    assert.deepEqual(convert({ amount: 100, unit: "ml" }, "g"), { amount: 100, approximate: true });
    assert.deepEqual(convert({ amount: 10, unit: "szt" }, "szt"), { amount: 10, approximate: false });
    assert.equal(convert({ amount: 10, unit: "szt" }, "g"), null);
  });

  test("whole packs cover the amount; loose goods cost what is taken", () => {
    assert.deepEqual(purchaseFor({ amount: 800, unit: "g" }, { amount: 500, unit: "g" }, 1499), {
      packs: 2,
      bought: 1000,
      costGrosz: 2998,
      approximate: false,
    });
    assert.equal(purchaseFor({ amount: 800, unit: "g" }, { amount: 1000, unit: "g" }, 2399, true)?.costGrosz, 1919);
    assert.equal(purchaseFor({ amount: 6, unit: "szt" }, { amount: 10, unit: "szt" }, 1459)?.packs, 1);
    assert.equal(purchaseFor({ amount: 6, unit: "szt" }, { amount: 500, unit: "g" }, 1459), null);
    assert.equal(purchaseFor({ amount: 0, unit: "g" }, { amount: 500, unit: "g" }, 1459), null);
    assert.equal(purchaseFor({ amount: 100, unit: "g" }, { amount: 0, unit: "g" }, 1459), null);
  });

  test("price per kilo, litre and piece", () => {
    assert.deepEqual(unitPrice(359, { amount: 250, unit: "g" }), { grosz: 1436, per: "kg" });
    assert.deepEqual(unitPrice(279, { amount: 1000, unit: "ml" }), { grosz: 279, per: "l" });
    assert.deepEqual(unitPrice(1459, { amount: 10, unit: "szt" }), { grosz: 146, per: "szt" });
    assert.equal(unitPriceLabel({ grosz: 1436, per: "kg" }), "14,36 zł/kg");
    assert.equal(unitPrice(359, null), null);
  });
});

describe("provider registry", () => {
  test("every provider has its policy written down", () => {
    for (const provider of PROVIDERS) {
      assert.ok(provider.authorization.evidence.length > 10, provider.id);
      assert.match(provider.authorization.checked, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(provider.testStatus.length > 0, provider.id);
    }
    assert.equal(APP_USE, "personal");
  });

  test("only a granted current-price provider gives verified prices", () => {
    assert.ok(grantsVerifiedPrices(providerById("frisco-feed")!));
    assert.ok(!grantsVerifiedPrices(providerById("frisco-feed")!, "commercial"));
    for (const id of ["blix", "lidl-web", "biedronka-online", "auchan-online", "stokrotka-feed", "open-prices"]) {
      assert.ok(!grantsVerifiedPrices(providerById(id)!), id);
    }
  });

  test("unverified sources are read only when turned on; contracts we lack never", () => {
    const blix = providerById("blix")!;
    assert.equal(ingestionAllowed(blix, { unverifiedSources: false }), false);
    assert.equal(ingestionAllowed(blix, { unverifiedSources: true }), true);
    assert.equal(ingestionAllowed(providerById("gs1-eprodukty")!, { unverifiedSources: true }), false);
    assert.equal(ingestionAllowed(providerById("licensed-feed")!, { unverifiedSources: true }), false);
    assert.equal(ingestionAllowed(providerById("open-prices")!, { unverifiedSources: false }), true);
    assert.equal(ingestionAllowed(providerById("frisco-feed")!, { unverifiedSources: false }), true);
    // A commercial deployment loses Frisco's personal-use permission.
    assert.equal(ingestionAllowed(providerById("frisco-feed")!, { unverifiedSources: false }, "commercial"), false);
    assert.equal(authorizationFor(providerById("lidl-everyday")!), "user_provided");
  });

  test("a stored price finds its provider by key, longest prefix first", () => {
    assert.equal(providerForKey("lidl-everyday:kuchnia lidla kasza")?.id, "lidl-everyday");
    assert.equal(providerForKey("lidl:11405938")?.id, "lidl-web");
    assert.equal(providerForKey("blix:filet z piersi kurczaka")?.id, "blix");
    assert.equal(providerForKey("frisco:123")?.id, "frisco-feed");
    assert.equal(providerForKey("openprices:34250")?.id, "open-prices");
    assert.equal(providerForKey("mystery:1"), null);
  });
});

describe("retailers", () => {
  test("sixteen Polish chains, none claiming an online shop nobody checked", () => {
    assert.equal(RETAILERS.length, 16);
    const online = RETAILERS.filter((retailer) => retailer.online).map((retailer) => retailer.id);
    assert.deepEqual(online.sort(), ["auchan", "biedronka", "frisco", "stokrotka"]);
    assert.equal(retailerForShop("zabka")?.name, "Żabka");
  });

  test("OpenStreetMap brands map to chains; other shops to none", () => {
    assert.equal(retailerForOsm("Carrefour Market")?.id, "carrefour");
    assert.equal(retailerForOsm("Żabka")?.id, "zabka");
    assert.equal(retailerForOsm(null, "Lidl Puławska")?.id, "lidl");
    assert.equal(retailerForOsm("Rossmann"), null);
    assert.equal(retailerForOsm("Galeria Renova"), null);
  });
});
