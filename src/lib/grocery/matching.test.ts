import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { matchCandidate, type Candidate, type Need } from "./matching.ts";
import { normalizeName, tokens, variantOf, withPolish } from "./normalize.ts";
import { parseQuantity } from "./units.ts";

const need = (name: string, unit: Need["unit"] = "g", gtin?: string): Need => ({ name, unit, gtin });
const product = (name: string, extra: Partial<Candidate> = {}): Candidate => ({ name, pack: parseQuantity(name), ...extra });
const tier = (item: Need, candidate: Candidate, excludedBrands: string[] = []) =>
  matchCandidate(item, candidate, { excludedBrands }).tier;

describe("Polish normalization", () => {
  test("letters fold, words split", () => {
    assert.deepEqual(tokens("Pierś z kurczaka, 1 kg"), ["piers", "z", "kurczaka", "1", "kg"]);
    assert.equal(normalizeName("  Łosoś  WĘDZONY "), "losos wedzony");
  });

  test("English names get their Polish words", () => {
    assert.match(withPolish("Virgin Olive Oil"), /oliwa z oliwek/);
    assert.match(withPolish("Sushi Rice"), /\bryz\b/);
    assert.match(withPolish("High Protein Milk"), /\bmleko\b/);
    assert.equal(withPolish("Twaróg chudy"), "twarog chudy");
  });

  test("variant attributes are read only from words that state them", () => {
    assert.deepEqual(variantOf("Twaróg chudy 250 g").fat, { level: "low" });
    assert.deepEqual(variantOf("Twaróg półtłusty").fat, { level: "mid" });
    assert.deepEqual(variantOf("Jogurt naturalny 2%").fat, { percent: 2 });
    assert.deepEqual(variantOf("Mleko UHT 0,5%").fat, { percent: 0.5 });
    assert.equal(variantOf("Twaróg 250 g").fat, undefined);
    // 30% in a tomato concentrate is not fat.
    assert.equal(variantOf("Koncentrat pomidorowy 30%").fat, undefined);
    assert.equal(variantOf("Ryż basmati 1 kg").rice, "basmati");
    assert.equal(variantOf("Ryż do sushi").rice, "sushi");
    assert.equal(variantOf("Jaja L z wolnego wybiegu 10 szt.").eggSize, "L");
    assert.equal(variantOf("Polędwiczki z kurczaka pieczone w marynacie").state, "cooked");
    assert.equal(variantOf("Truskawki mrożone 450 g").state, "frozen");
    assert.ok(variantOf("Oliwa z oliwek extra virgin").extraVirgin);
  });
});

describe("matching tiers", () => {
  test("the prompt's examples match exactly when every attribute is there", () => {
    assert.equal(tier(need("pierś z kurczaka"), product("Filet z piersi kurczaka 800 g")), "attributes");
    assert.equal(tier(need("ryż basmati"), product("Ryż basmati 500 g")), "attributes");
    assert.equal(tier(need("jogurt grecki naturalny"), product("Jogurt grecki naturalny 400 g")), "attributes");
    assert.equal(tier(need("jajka", "szt"), product("Jaja z wolnego wybiegu M 6 szt.")), "attributes");
    assert.equal(tier(need("oliwa z oliwek", "ml"), product("Oliwa z oliwek 100 ml")), "attributes");
  });

  test("a barcode match wins, but never on an in-store code", () => {
    assert.equal(tier(need("skyr", "g", "5900512904665"), product("Skyr", { gtin: "05900512904665" })), "gtin");
    assert.equal(tier(need("twaróg chudy", "g", "20858087"), product("Twaróg Chudy 250g", { gtin: "20858087" })), "attributes");
  });

  test("a confirmed product is a listing match", () => {
    assert.equal(tier(need("skyr"), product("Piątnica Skyr 150 g", { confirmed: true })), "listing");
    assert.equal(tier(need("skyr"), product("Piątnica Skyr 150 g", { rejected: true })), "none");
  });

  test("an attribute the product does not state is unknown, not a match", () => {
    assert.equal(tier(need("twaróg chudy"), product("Twaróg 250 g")), "category");
    assert.equal(tier(need("mozzarella light"), product("Mozzarella 125 g")), "category");
    assert.equal(tier(need("skyr"), product("Skyr naturalny", { pack: null })), "category");
    assert.equal(tier(need("skyr"), product("Skyr naturalny", { pack: { amount: 450, unit: "g" }, packAssumed: true })), "category");
  });

  test("false positives the keyword rules alone let through become substitutions", () => {
    const fatty = matchCandidate(need("twaróg chudy"), product("Twaróg tłusty 250 g"));
    assert.equal(fatty.tier, "substitution");
    assert.ok(fatty.needsApproval);
    assert.match(fatty.conflicts[0], /tłuszcz/);
    assert.equal(tier(need("twaróg chudy"), product("Twaróg półtłusty 250 g")), "substitution");
    assert.equal(tier(need("twaróg chudy"), product("Twaróg 0,5% 250 g")), "attributes");
    assert.equal(tier(need("jogurt 2%"), product("Jogurt grecki 10% 400 g")), "substitution");
    assert.equal(tier(need("jogurt 2%"), product("Jogurt naturalny 2% 370 g")), "attributes");
    assert.equal(tier(need("wołowina 5%"), product("Wołowina mielona 20% 500 g")), "substitution");
    assert.equal(tier(need("wołowina 5%"), product("Wołowina mielona 5% 400 g")), "attributes");
    assert.equal(tier(need("mozzarella light"), product("Mozzarella light 125 g")), "attributes");
    assert.equal(tier(need("ryż basmati"), product("Ryż jaśminowy 1 kg")), "substitution");
  });

  test("different products are not matched at all", () => {
    assert.equal(tier(need("pierś z kurczaka"), product("Polędwiczki z kurczaka pieczone w marynacie 350 g")), "none");
    assert.equal(tier(need("jogurt naturalny"), product("Jogurt pitny truskawkowy 360 g")), "none");
    assert.equal(tier(need("ryż"), product("Ryż do sushi 500 g")), "none");
    assert.equal(tier(need("jajka", "szt"), product("Jaja przepiórcze 18 szt")), "none");
    assert.equal(tier(need("mleko", "ml"), product("Mleko kokosowe 400 ml")), "none");
    assert.equal(tier(need("skyr"), product("Skyr szarlotka 330 g")), "none");
    // Pickled ("małosolne") is not the fresh cucumber on the list (seen in Warsaw Open Prices data).
    assert.equal(tier(need("ogórek"), product("Chef Select Ogórki małosolne")), "none");
    // A bunch of spring onions or shallots is not the onion on the list (seen in Warsaw Open Prices data).
    assert.equal(tier(need("cebula czerwona"), product("Carrefour Cebula dymka pęczek")), "none");
    assert.equal(tier(need("cebula"), product("Szalotka 250 g")), "none");
    // Ready food that names the ingredient (found by the Warsaw pilot's audit of Open Food Facts results).
    assert.equal(tier(need("papryka czerwona"), product("Kebab - kebab z kurczaka, kapusta pekińska, czerwona papryka 215 g")), "none");
    assert.equal(tier(need("banan"), product("Owsiane smoothie mango i banan 250 g")), "none");
    assert.equal(tier(need("tuńczyk"), product("Tuńczyk Mexicans z warzywami 160 g")), "none");
    assert.equal(tier(need("papryka"), product("Lays Papryka 140 g")), "none");
    assert.equal(tier(need("pomidor"), product("Chrupki pomidor z serem 100 g")), "none");
    assert.equal(tier(need("cebula czerwona"), product("Mozarella, pomidor, cebula czerwona 250 g")), "none");
    assert.equal(tier(need("whey"), product("Premium Whey Bar Protein 50% 80 g")), "none");
    assert.equal(tier(need("pieczywo"), product("Pieczywo Sonko Lekkie 7 Ziaren 90 g")), "none");
    // English names from Open Prices: paprika is the spice, refried black beans are a paste, "taste" a flavour.
    assert.equal(tier(need("papryka"), product("Smoked sweet paprika 70 g")), "none");
    assert.equal(tier(need("fasola czerwona"), product("Isadora Refried Black Beans 430 g")), "none");
    assert.equal(tier(need("banan"), product("Müllermilch Protein Banana Taste 400 ml")), "none");
    assert.equal(tier(need("maliny mrożone"), product("Bifix Napar owocowy z maliną 40 g")), "none");
    assert.equal(tier(need("ogórek"), product("Ogórek Dziadunia Różana rozkosz 860 g")), "none");
  });

  test("a pack in another unit can never price the item", () => {
    assert.equal(tier(need("jajka", "szt"), product("Jaja kurze 600 g")), "none");
  });

  test("excluded brands are never suggested", () => {
    assert.equal(tier(need("skyr"), product("Piątnica Skyr naturalny 450 g"), ["Piątnica"]), "none");
    assert.equal(tier(need("skyr"), product("Skyr naturalny 450 g", { brand: "Pilos" }), ["pilos"]), "none");
    assert.equal(tier(need("skyr"), product("Piątnica Skyr naturalny 450 g"), ["Pilos"]), "attributes");
  });

  test("cooked or smoked meat is not the raw meat on the list", () => {
    const cooked = matchCandidate(need("kurczak"), product("Filet z piersi kurczaka gotowany 100 g"));
    assert.equal(cooked.tier === "none" || cooked.tier === "substitution", true);
    assert.equal(tier(need("kurczak gotowy"), product("Filet z kurczaka pieczony 200 g")), "attributes");
  });

  test("false positives found by the Warsaw pilot audit (Frisco feed, 21.10.2026)", () => {
    const wrong: [string, string, Need["unit"]][] = [
      ["orzo", "Skorzonera (400g-600g)", "g"],
      ["pesto", "Pestki dyni", "g"],
      ["whey", "Odżywka do włosów", "g"],
      ["kakao", "Ciasteczka kakaowe", "g"],
      ["sos teriyaki", "Beef Jerky Teriyaki", "g"],
      ["sos sojowy", "Produkt sojowy kokos", "ml"],
      ["filet z indyka", "Filetki z Indykiem", "g"],
      ["wołowina mielona", "Łój wołowy", "g"],
      ["ser gouda w plastrach", "Ser krem", "g"],
      ["tortilla pszenna", "Tortilla z mięsem i warzywami", "g"],
      ["pomidor", "Pomidory całe", "g"],
      ["masło orzechowe", "Baton healthy snack - masło orzechowe", "g"],
      ["salsa", "Dip serowy (salsa)", "g"],
      ["makaron spaghetti", "Spaghetti 4 sery", "g"],
      // Open Prices, Warsaw.
      ["papryka", "Carrefour Vegetal Hummus paprykowy 160 g", "g"],
      ["banan", "Piątnica Koktajl białkowy Truskawka & Banan 256 g", "g"],
      ["maliny mrożone", "Kubuś play woda & owoce o smaku malina", "g"],
      ["curry", "Ajinomoto Japanese Curry Flavour", "g"],
      ["jabłko", "EkaMedica jabłko pokrzywa mięta 300 ml", "g"],
      ["whey", "Mleczna odżywka wyzwalająca blask Natural Shine", "g"],
    ];
    for (const [item, name, unit] of wrong) assert.equal(tier(need(item, unit), product(name)), "none", `${item} <- ${name}`);
  });

  test("a different kind in the same family is a substitution, never the item", () => {
    const swaps: [string, string][] = [
      ["makaron spaghetti", "Makaron penne 500 g"],
      ["papryka czerwona", "Papryka żółta 500 g"],
      ["truskawki mrożone", "Maliny mrożone 450 g"],
      ["miód wielokwiatowy", "Miód leśny 400 g"],
      ["jaja z wolnego wybiegu", "Jaja ekologiczne - 10 szt. BIO"],
      ["jogurt naturalny", "Jogurt grecki 400 g"],
      ["jogurt grecki naturalny", "Jogurt naturalny 400 g"],
    ];
    for (const [item, name] of swaps) {
      assert.equal(tier(need(item, item.startsWith("jaja") ? "szt" : "g"), product(name)), "substitution", `${item} <- ${name}`);
    }
  });

  test("a word the item says and the product does not keeps the match at category", () => {
    assert.equal(tier(need("szynka z indyka w plastrach"), product("Szynka z Indyka 150 g")), "category");
    assert.equal(tier(need("cebula czerwona"), product("Cebula 1 kg")), "category");
    assert.equal(tier(need("chleb żytni"), product("Chleb IG 500 g")), "category");
    assert.equal(tier(need("passata"), product("Pomidory krojone 400 g")), "category");
    assert.equal(tier(need("pomidory koktajlowe"), product("Pomidory cherry 250 g")), "attributes");
    assert.equal(tier(need("szynka z indyka w plastrach"), product("Szynka z indyka w plastrach 100 g")), "attributes");
  });

  test("English names from open data reach the Polish rules", () => {
    assert.equal(tier(need("oliwa", "ml"), product("Virgin Olive Oil 500 ml")), "attributes");
    assert.equal(tier(need("ryż"), product("Sushi Rice 500g")), "none");
  });
});
