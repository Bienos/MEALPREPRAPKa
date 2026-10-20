/**
 * Lidl's everyday ("Twoje niskie ceny") prices, read from the pages of its
 * leaflet "Rewolucja cenowa! Każdego dnia tanio" (lidl.pl/l/pl/gazetki/
 * rewolucja-cenowa-oszczedzaj-kazdego-dnia-16092026, valid to 31.12.2026).
 *
 * Lidl has no online food catalogue, and its prices are the same in every
 * shop; this leaflet is the one place it shows regular prices of staples.
 * Its text is a scrambled bag of words, so the prices are read off the page
 * images by hand (20.10.2026) instead of parsed. Pages 3, 5, 7, 9, 25 and 31:
 * cheese, high-protein dairy, plant drinks, bread, oils, pasta, groats, rice.
 * When the leaflet ends, so do these rows (`validTo`); read the next one.
 *
 * Not `server-only` so the tests can import it.
 */

import type { Unit } from "../meals/ingredients.ts";
import type { ShopPromo } from "./types.ts";

const LEAFLET = "https://www.lidl.pl/l/pl/gazetki/rewolucja-cenowa-oszczedzaj-kazdego-dnia-16092026/ar/0";
const VALID_FROM = "2026-09-16";
const VALID_TO = "2026-12-31";

/** [name, pack quantity, pack unit, price for the pack] */
type Row = [string, number, Unit, number];

const ROWS: Row[] = [
  // page 3 — cheese
  ["Pilos Ser Carski w plastrach 130 g", 130, "g", 3.99],
  ["Pilos Ser w plastrach edam lub gouda 150 g", 150, "g", 4.49],
  ["Pilos Ser gouda w plastrach 300 g", 300, "g", 8.49],
  ["Pilos Ser Carski w plastrach 300 g", 300, "g", 8.99],
  ["Pilos Ser salami w plastrach 300 g", 300, "g", 8.99],
  ["Pilos Ser tylżycki w plastrach 300 g", 300, "g", 8.99],
  ["Pilos Ser Carski w plastrach XXL 500 g", 500, "g", 13.99],
  ["Pilos Ser gouda w plastrach XXL 500 g", 500, "g", 11.99],
  ["Pilos Ser gouda w plastrach XXL 1 kg", 1000, "g", 22.99],
  // page 5 — high-protein dairy
  ["Pilos Napój wysokobiałkowy czekoladowy 350 g", 350, "g", 3.99],
  ["Pilos Napój wysokobiałkowy różne rodzaje 350 g", 350, "g", 4.49],
  ["Pełnowartościowy posiłek w butelce 500 ml", 500, "ml", 7.99],
  ["Pilos Serek wysokobiałkowy 200 g", 200, "g", 3.39],
  ["Pilos Deser twarogowy wysokobiałkowy 125 g", 125, "g", 3.39],
  ["Pilos Jogurt owocowy wysokobiałkowy 200 g", 200, "g", 2.99],
  ["Pilos Deser mleczno-ryżowy wysokobiałkowy 200 g", 200, "g", 3.19],
  ["Pilos Kaszka wysokobiałkowa 200 g", 200, "g", 3.39],
  ["Pilos Pudding wysokobiałkowy 200 g", 200, "g", 3.39],
  // page 7 — plant drinks
  ["Vemondo BIO Napój owsiany 1 l", 1000, "ml", 3.99],
  ["Vemondo BIO Napój kokosowy bez dodatku cukrów 1 l", 1000, "ml", 4.99],
  ["Vemondo BIO Napój migdałowy bez dodatku cukrów 1 l", 1000, "ml", 4.99],
  ["Vemondo BIO Napój sojowy bez dodatku cukrów 1 l", 1000, "ml", 3.99],
  ["Vemondo BIO Napój owsiany kakaowy 1 l", 1000, "ml", 4.99],
  ["Alpro Napój roślinny Barista 750 ml", 750, "ml", 7.99],
  // page 9 — bread
  ["Chleb żytni bez drożdży, z niskim indeksem glikemicznym 450 g", 450, "g", 3.45],
  ["Bułka grahamka 80 g", 80, "g", 0.65],
  ["Bułka pszenna 65 g", 65, "g", 0.59],
  ["Chleb na maślance 550 g", 550, "g", 3.99],
  ["Bułka typu górskiego 75 g", 75, "g", 0.99],
  ["Bułka ziemniaczana 80 g", 80, "g", 0.99],
  ["Hot dog 100 g", 100, "g", 2.79],
  ["Pain au chocolate, ciastko z czekoladą 70 g", 70, "g", 2.39],
  ["Croissant maślany 60 g", 60, "g", 1.59],
  // page 25 — oils
  ["Vita D'or Olej słonecznikowy Wyśmienity 1 l", 1000, "ml", 5.99],
  ["Vita D'or Olej rzepakowy Wyśmienity 1 l", 1000, "ml", 4.59],
  ["Wielkopolski Olej rzepakowy 1 l", 1000, "ml", 5.99],
  ["Vita D'or Olej rzepakowy Wyśmienity 3 l", 3000, "ml", 13.49],
  ["Deluxe Oliwa z oliwek Chania Kritis 500 ml", 500, "ml", 24.99],
  ["Deluxe Włoska oliwa z oliwek 500 ml", 500, "ml", 25.99],
  // page 31 — pasta, groats, rice
  ["Kuchnia Lidla Kasza jęczmienna wiejska 1 kg", 1000, "g", 1.99],
  ["Kuchnia Lidla Ryż biały długoziarnisty 4 x 150 g", 600, "g", 2.99],
  ["Combino Makaron bez glutenu 500 g", 500, "g", 3.99],
  ["Combino Makaron świderki 1 kg", 1000, "g", 3.79],
  ["Combino Makaron spaghetti 500 g", 500, "g", 1.99],
  ["Barilla Makaron spaghetti 1 kg", 1000, "g", 9.99],
  ["Combino Makaron 100% warzywny 250 g", 250, "g", 4.99],
  ["Polmak Makaron tradycyjny z Ludwina 4-jajeczny 250 g", 250, "g", 3.99],
  ["Lubella Makaron spaghetti 400 g", 400, "g", 4.49],
  ["Lubella Makaron pióra 400 g", 400, "g", 4.49],
  ["Lubella Makaron krajanka 5-jajeczna 400 g", 400, "g", 4.99],
];

/** Folded name as the key: stable, so a "Tak" answer on one of these is remembered. */
function keyOf(name: string): string {
  return `lidl-everyday:${name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()}`;
}

/** Lidl's everyday prices as shelf prices (not deals), each valid until the leaflet ends. */
export const LIDL_EVERYDAY: ShopPromo[] = ROWS.map(([name, packQuantity, packUnit, price]) => ({
  shop: "lidl",
  productKey: keyOf(name),
  name,
  packQuantity,
  packUnit,
  loose: false,
  promoPrice: price,
  regularPrice: null,
  validFrom: VALID_FROM,
  validTo: VALID_TO,
  conditions: "Stała cena regularna Lidla (gazetka „Rewolucja cenowa”)",
  appOnly: false,
  multibuy: null,
  multibuyMin: 1,
  sourceUrl: LEAFLET,
  shelf: true,
  fetchedAt: "2026-10-20",
}));
