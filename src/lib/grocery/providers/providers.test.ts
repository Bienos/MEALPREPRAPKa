import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { assessPrice } from "../eligibility.ts";
import { providerById, type Provider } from "../providers.ts";
import { gs1Missing, lookupGs1 } from "./gs1.ts";
import { parseCsvRows, parseLicensedFeed } from "./licensed-feed.ts";
import { offProductUrl, offSearchUrl, parseOffProduct, parseOffSearch } from "./open-food-facts.ts";
import { openPricesFact, openPricesUrl, parseOpenPricesPage } from "./open-prices.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));

describe("Open Prices", () => {
  const page = parseOpenPricesPage(fixture("open-prices-2026-10-20.json"), "2026-10-20");

  test("only PLN prices at shops in Poland get in; the rest is counted by reason", () => {
    assert.equal(page.records.length + Object.values(page.rejected).reduce((a, b) => a + (b ?? 0), 0), 16);
    assert.ok(page.records.every((record) => record.store.city !== null));
    // Three French records with no currency, one duplicate Open Prices flagged itself.
    assert.equal(page.rejected.currency, 3);
    assert.equal(page.rejected.duplicate, 1);
    assert.ok(!page.records.some((record) => record.productName.includes("coquillettes")));
  });

  test("a Lidl receipt line becomes a dated community price with its proof page", () => {
    const twarog = page.records.find((record) => record.openPricesId === 341363);
    assert.ok(twarog);
    assert.equal(twarog.productName, "Pilos Twaróg Chudy");
    assert.equal(twarog.amountGrosz, 359);
    assert.deepEqual(twarog.pack, { amount: 250, unit: "g" });
    assert.equal(twarog.store.retailer, "lidl");
    assert.equal(twarog.store.city, "Warszawa");
    assert.equal(twarog.observedOn, "2026-10-05");
    assert.equal(twarog.proofType, "RECEIPT");
    assert.equal(twarog.url, "https://prices.openfoodfacts.org/prices/341363");
    // Lidl's own short code is kept, canonical.
    assert.equal(twarog.gtin, "00000020858087");
  });

  test("never a current price: in Warsaw it is community history, elsewhere unavailable", () => {
    const twarog = page.records.find((record) => record.openPricesId === 341363)!;
    const ctx = { today: "2026-10-20", city: "Warszawa", channel: "both" as const, loyalty: [] };
    const result = assessPrice(openPricesFact(twarog), ctx);
    assert.equal(result.state, "community");
    assert.equal(result.strict, false);
    assert.equal(assessPrice(openPricesFact(twarog), { ...ctx, city: "Gdańsk" }).state, "unavailable");
    assert.equal(assessPrice(openPricesFact(twarog), { ...ctx, today: "2027-02-01" }).state, "expired");
  });

  test("discounts keep their kind; shops of chains we do not track have no retailer", () => {
    const sale = page.records.find((record) => record.discountType === "SALE");
    assert.equal(sale?.priceType, "promotion");
    const quantity = page.records.find((record) => record.discountType === "QUANTITY");
    assert.equal(quantity?.priceType, "multibuy");
    assert.ok(page.records.some((record) => record.store.retailer === null));
  });

  test("no contributor usernames are read", () => {
    assert.ok(!JSON.stringify(page.records).includes('"owner"'));
  });

  test("the query asks for PLN and incremental pages; the response shape is checked", () => {
    const url = new URL(openPricesUrl(2, "2026-10-18"));
    assert.equal(url.searchParams.get("currency"), "PLN");
    assert.equal(url.searchParams.get("created__gte"), "2026-10-18");
    assert.equal(url.searchParams.get("page"), "2");
    assert.throws(() => parseOpenPricesPage({ nope: true }, "2026-10-20"));
    assert.throws(() => parseOpenPricesPage({ items: [{ junk: 1 }, { junk: 2 }] }, "2026-10-20"));
  });
});

describe("Open Food Facts", () => {
  test("a product from v3 and v2 answers", () => {
    const twarozek = parseOffProduct(fixture("off-v3-5900820027834.json"));
    assert.equal(twarozek?.gtin, "05900820027834");
    assert.equal(twarozek?.name, "Protein+ Twarożek grani naturalny LEKKI*");
    assert.equal(twarozek?.brand, "Mlekpol");
    assert.deepEqual(twarozek?.nutrition, { kcal: 95, proteinG: 15, fatG: 3, carbsG: 2 });
    // Country tags are volunteer data: this Polish product says only "United Kingdom".
    assert.deepEqual(twarozek?.countries, ["en:united-kingdom"]);

    const milk = parseOffProduct(fixture("off-v2-5905784329192.json"));
    assert.equal(milk?.name, "Mleko UHT 0.5%");
    assert.deepEqual(milk?.pack, { amount: 1000, unit: "ml" });
    assert.equal(milk?.url, "https://world.openfoodfacts.org/product/5905784329192");
  });

  test("an unknown barcode is null, not an error; a changed format is an error", () => {
    assert.equal(parseOffProduct(fixture("off-v2-missing.json")), null);
    assert.equal(parseOffProduct(fixture("off-v3-missing.json")), null);
    assert.throws(() => parseOffProduct("<html>"));
  });

  test("search answers keep products with a valid barcode and a name", () => {
    const results = parseOffSearch(fixture("off-search-twarog-chudy.json"));
    assert.ok(results.length >= 3);
    assert.ok(results.every((product) => /^\d{14}$/.test(product.gtin)));
    assert.match(offSearchUrl("twaróg chudy"), /tag_0=poland/);
    assert.match(offProductUrl("05900820027834"), /\/api\/v3\/product\/5900820027834\?/);
  });
});

describe("GS1 Polska eProdukty", () => {
  test("refuses to run and says what is missing", async () => {
    await assert.rejects(lookupGs1("5900820027834"), /nie jest skonfigurowane/);
    assert.equal(gs1Missing(false).length, 3);
    assert.equal(gs1Missing(true).length, 2);
  });
});

describe("licensed partner feeds", () => {
  // A test-only provider standing for a future partner with a contract. The rows are synthetic test data, not prices.
  const partner: Provider = {
    ...providerById("licensed-feed")!,
    name: "Partner testowy",
    authorization: { ...providerById("licensed-feed")!.authorization, personal: "granted", commercial: "granted" },
  };
  const csv = [
    "retailer,sku,gtin,name,pack_quantity,pack_unit,loose,price_grosz,currency,price_type,valid_from,valid_to,channel,region,in_stock,min_quantity,observed_at",
    "biedronka,123,5900820027834,Twarożek testowy,200,g,false,399,PLN,regular,2026-10-20,,store,PL,true,1,2026-10-20T06:00:00+02:00",
    'lidl,9,,"Jogurt, testowy",400,g,false,0,PLN,regular,2026-10-20,,store,PL,,1,2026-10-20T06:00:00+02:00',
    "lidl,10,,Jogurt testowy,400,g,false,299,EUR,regular,2026-10-20,,store,PL,,1,2026-10-20T06:00:00+02:00",
    "lidl,11,,Skyr testowy,450,g,false,599,PLN,loyalty,2026-10-20,2026-10-26,store,PL,,1,2026-10-20T06:00:00+02:00",
  ].join("\n");

  test("CSV fields with commas and quotes", () => {
    const rows = parseCsvRows('a,b\n"x, y","say ""hi"""\n');
    assert.deepEqual(rows, [{ a: "x, y", b: 'say "hi"' }]);
  });

  test("valid rows become facts; bad rows are rejected whole, with the reason", () => {
    const result = parseLicensedFeed(csv, partner);
    assert.equal(result.facts.length, 1);
    assert.equal(result.facts[0].gtin, "05900820027834");
    assert.equal(result.facts[0].fact.availability, "in_stock");
    assert.equal(result.facts[0].fact.region.national, true);
    assert.deepEqual(
      result.rejected.map((one) => one.row),
      [2, 3, 4],
    );
    assert.match(result.rejected[2].reason, /lojalnościowa bez programu/);
  });

  test("nothing is read for a provider without a licence", () => {
    assert.throws(() => parseLicensedFeed(csv, providerById("licensed-feed")!), /brak licencji/);
  });
});
