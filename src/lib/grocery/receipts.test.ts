import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  contributionsCsv,
  expandReceiptName,
  linePrice,
  parseReceiptText,
  redactReceiptText,
  toContribution,
} from "./receipts.ts";

// A synthetic receipt in the layout Polish fiscal printers use. Test data, not real prices.
const RECEIPT = `
Jeronimo Martins Polska S.A.
Biedronka nr 1234
ul. Przykładowa 1, 00-001 Warszawa
NIP 779-10-11-327
2026-10-18 nr wydr. 123456
PARAGON FISKALNY
PIERS KURCZ.FILET KG     0,834 x23,99   20,01C
SKYR NAT. 150G             2 *2,99        5,98C
JOG.GREC.NAT 400G          1 x4,49        4,49C
Rabat                                    -0,50C
TWAR.CHUDY 250G            1 x3,59        3,59C
BANANY LUZ               1,105 x5,99      6,62C
WODA MIN. 1,5L             1 x1,99        1,99A
KAUCJA BUTELKA             1 x0,50        0,50A
PLATKI OWS.
                           1 x4,99        4,99C
SPRZED. OPOD. PTU A               2,49
PTU A 23%                          0,47
SUMA PLN                          47,67
Karta płatnicza                   47,67
**** **** **** 4321
Kasjer: Anna Nowak
Nr transakcji: 99881122
Moja Biedronka nr 1234567890123
tel. 600 700 800
12:41:07
`;

describe("receipt redaction", () => {
  test("card, transaction, cashier, loyalty number, phone and time are removed; the date stays", () => {
    const { text, removed } = redactReceiptText(RECEIPT);
    assert.ok(removed >= 6);
    assert.ok(!text.includes("4321"));
    assert.ok(!text.includes("Anna Nowak"));
    assert.ok(!text.includes("99881122"));
    assert.ok(!text.includes("1234567890123"));
    assert.ok(!text.includes("600 700 800"));
    assert.ok(!text.includes("12:41"));
    assert.ok(text.includes("2026-10-18"));
    assert.ok(text.includes("SKYR NAT. 150G"));
    // Placeholders are never redacted twice.
    assert.ok(text.includes("[karta lojalnościowa]"));
    assert.ok(!text.includes("[["));
  });

  test("an e-mail address is removed", () => {
    assert.equal(redactReceiptText("e-paragon: jan.kowalski@example.com").text, "e-paragon: [e-mail]");
  });
});

describe("receipt abbreviations", () => {
  test("shorthand becomes words the matching rules know", () => {
    assert.deepEqual(expandReceiptName("PIERS KURCZ.FILET KG"), { name: "pierś kurczaka filet", byWeight: true });
    assert.equal(expandReceiptName("TWAR.CHUDY 250G").name, "twaróg chudy 250g");
    assert.equal(expandReceiptName("JOG.GREC.NAT 400G").name, "jogurt grecki naturalny 400g");
    assert.equal(expandReceiptName("PLATKI OWS.").name, "płatki owsiane");
    assert.equal(expandReceiptName("PL.OWS.GÓRSKIE 500G").name, "płatki owsiane górskie 500g");
    assert.equal(expandReceiptName("WODA MIN. 1,5L").name, "woda min 1,5l");
    assert.equal(expandReceiptName("CHLEB ŻYTNI").name, "chleb żytni");
    assert.deepEqual(expandReceiptName("BANANY LUZ"), { name: "banany", byWeight: true });
  });
});

describe("receipt parsing", () => {
  const parsed = parseReceiptText(redactReceiptText(RECEIPT).text);

  test("chain, date and printed sum", () => {
    assert.equal(parsed.retailer, "biedronka");
    assert.equal(parsed.date, "2026-10-18");
    assert.equal(parsed.totalGrosz, 4767);
  });

  test("every product line, weighed goods in kilos, a discount on the line above it", () => {
    const byName = new Map(parsed.lines.map((line) => [line.name, line]));
    assert.deepEqual(
      parsed.lines.map((line) => line.name),
      [
        "pierś kurczaka filet",
        "skyr naturalny 150g",
        "jogurt grecki naturalny 400g",
        "twaróg chudy 250g",
        "banany",
        "woda min 1,5l",
        "kaucja butelka",
        "płatki owsiane",
      ],
    );
    const chicken = byName.get("pierś kurczaka filet")!;
    assert.deepEqual([chicken.quantity, chicken.unit, chicken.unitPriceGrosz, chicken.totalGrosz], [0.834, "kg", 2399, 2001]);
    assert.deepEqual([byName.get("skyr naturalny 150g")!.quantity, byName.get("skyr naturalny 150g")!.unit], [2, "szt"]);
    assert.equal(byName.get("jogurt grecki naturalny 400g")!.discountGrosz, 50);
    assert.equal(byName.get("banany")!.unit, "kg");
    assert.equal(byName.get("kaucja butelka")!.deposit, true);
    // The name on one line, the quantity on the next.
    assert.equal(byName.get("płatki owsiane")!.totalGrosz, 499);
  });

  test("tax and payment lines are not products, and the sum checks out", () => {
    assert.ok(!parsed.lines.some((line) => /ptu|suma|karta/.test(line.name)));
    assert.equal(parsed.sumMatches, true);
  });

  test("a sum that does not match says so", () => {
    const off = parseReceiptText("SKYR NAT. 150G   1 x2,99   2,99C\nSUMA PLN   9,99");
    assert.equal(off.sumMatches, false);
  });
});

describe("prices and sharing", () => {
  test("a unit price after the discount; a deposit has none", () => {
    assert.deepEqual(linePrice({ quantity: 2, unit: "szt", totalGrosz: 598, discountGrosz: 0, deposit: false }), {
      amountGrosz: 299,
      per: "pack",
    });
    assert.deepEqual(linePrice({ quantity: 0.834, unit: "kg", totalGrosz: 2001, discountGrosz: 0, deposit: false }), {
      amountGrosz: 2399,
      per: "kg",
    });
    assert.deepEqual(linePrice({ quantity: 1, unit: "szt", totalGrosz: 449, discountGrosz: 50, deposit: false })?.amountGrosz, 399);
    assert.equal(linePrice({ quantity: 1, unit: "szt", totalGrosz: 50, discountGrosz: 0, deposit: true }), null);
  });

  test("a shared line carries the chain, town, day, product and price, and nothing else", () => {
    const shared = toContribution(
      { name: "Skyr naturalny 150 g", quantity: 2, unit: "szt", totalGrosz: 598, discountGrosz: 0, deposit: false, gtin: null },
      { retailer: "biedronka", city: "Warszawa", date: "2026-10-18T12:41:07Z" },
    );
    assert.deepEqual(shared, {
      retailer: "biedronka",
      city: "Warszawa",
      observedOn: "2026-10-18",
      productName: "Skyr naturalny 150 g",
      gtin: null,
      amountGrosz: 299,
      per: "pack",
    });
    assert.deepEqual(Object.keys(shared!).sort(), ["amountGrosz", "city", "gtin", "observedOn", "per", "productName", "retailer"]);
  });

  test("the export is CSV with an escaped name", () => {
    const csv = contributionsCsv([
      { retailer: "lidl", city: "Warszawa", observedOn: "2026-10-05", productName: 'Twaróg "Chudy", 250 g', gtin: "20858087", amountGrosz: 359, per: "pack" },
    ]);
    assert.equal(
      csv,
      'date,retailer,city,product_name,product_code,price,currency,price_per\n2026-10-05,lidl,Warszawa,"Twaróg ""Chudy"", 250 g",20858087,3.59,PLN,UNIT',
    );
  });
});
