import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { parseAuchanProduct, parseAuchanSitemap } from "./auchan.ts";

/** Real zakupy.auchan.pl responses from 19.10.2026: part of the sitemap, and three product pages cut to their JSON. */
const read = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const catalogue = parseAuchanSitemap(read("auchan-sitemap-2026-10-19.xml"));
const entry = (id: string) => {
  const found = catalogue.find((candidate) => candidate.productKey === `auchan:${id}`);
  assert.ok(found, id);
  return found;
};
const page = (id: string) => parseAuchanProduct(read(`auchan-product-${id}.html`), entry(id));

describe("Auchan sitemap", () => {
  test("product pages, named from their address; image links are not products", () => {
    assert.ok(catalogue.length > 0);
    assert.ok(catalogue.every((one) => /^auchan:\d{8}$/.test(one.productKey) && one.url.includes("/products/")));
    assert.equal(entry("00706828").name, "jaja ściółkowe rozmiar m auchan 10 sztuk");
    assert.equal(entry("00746801").name, "filet z królika auchan");
    assert.throws(() => parseAuchanSitemap("<urlset></urlset>"), /Auchan/);
  });
});

describe("Auchan product page", () => {
  test("a pack: the price and the pack from the product's own JSON", () => {
    const skyr = page("00128805");
    assert.deepEqual([skyr?.price, skyr?.packQuantity, skyr?.packUnit, skyr?.loose], [4.89, 150, "g", false]);
    assert.equal(skyr?.name, "BIO Jogurt Skyr z wanilią EKOŁukta 150 g");
  });

  test("eggs come in pieces", () => {
    const eggs = page("00706828");
    assert.deepEqual([eggs?.price, eggs?.packQuantity, eggs?.packUnit], [9.98, 10, "szt"]);
  });

  test("sold by weight: the price per kilo, and I pay for what I take", () => {
    const rabbit = page("00746801");
    assert.deepEqual([rabbit?.price, rabbit?.packQuantity, rabbit?.packUnit, rabbit?.loose], [65.98, 1000, "g", true]);
  });

  test("another product's page, or one out of stock, gives no price", () => {
    assert.equal(parseAuchanProduct(read("auchan-product-00128805.html"), entry("00706828")), null);
    const gone = read("auchan-product-00128805.html").replace('"available":true', '"available":false');
    assert.equal(parseAuchanProduct(gone, entry("00128805")), null);
  });
});
