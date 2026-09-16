/**
 * DEVELOPMENT ONLY. A small slice of the real sheet so the Meals screen works
 * without Google credentials. Never used when NODE_ENV is "production"
 * (see `library.ts`). Includes one blank and one malformed row on purpose, so
 * the skip-and-flag path is exercised locally too.
 */
export const FIXTURE_SHEET_TITLE = "Baza posiłków (fixture)";

export const fixtureRows: string[][] = [
  ["Typ", "Danie", "Wersja", "Składniki i gramatura", "Kcal", "B (g)", "T (g)", "W (g)", "Czas", "Batch", "Lodówka", "Mrożenie"],
  ["Śniadanie", "Overnight oats", "DT", "Płatki 80 g SUCHE; skyr 250 g; whey 30 g; banan 120 g; masło orzechowe 15 g", "772", "66", "16", "91", "5 min", "3 słoiki", "3 dni", "Nie"],
  ["Śniadanie", "Overnight oats", "DNT", "Płatki 50 g SUCHE; skyr 300 g; whey 30 g; banan 100 g; masło orzechowe 25 g", "739", "70", "19", "72", "5 min", "3 słoiki", "3 dni", "Nie"],
  ["Śniadanie", "Skyr bowl", "DT", "Skyr 300 g; whey 20 g; płatki 60 g SUCHE; owoce 150 g; PB 20 g", "677", "63", "17", "68", "3 min", "1", "—", "Nie"],
  ["Śniadanie", "Skyr bowl", "DNT", "Skyr 350 g; whey 20 g; płatki 40 g SUCHE; owoce 150 g; PB 25 g", "666", "67", "18", "59", "3 min", "1", "—", "Nie"],
  ["Meal prep", "Chicken Rice", "DT", "Kurczak 200 g SUROWY; ryż 110 g SUCHY; warzywa 200 g; oliwa 10 g", "789", "59", "17", "100", "25–30 min", "4–6", "2–3 dni", "Tak"],
  ["Meal prep", "Chicken Rice", "DNT", "Kurczak 230 g SUROWY; ryż 60 g SUCHY; warzywa 250 g; oliwa 15 g", "715", "63", "23", "64", "25–30 min", "4–6", "2–3 dni", "Tak"],
  ["Meal prep", "Turkey Pasta", "DT", "Indyk 220 g SUROWY; makaron 110 g SUCHY; passata 200 g; warzywa 150 g; oliwa 5 g", "839", "68", "19", "99", "25–30 min", "4–6", "3 dni", "Tak"],
  ["Meal prep", "Turkey Pasta", "DNT", "Indyk 250 g SUROWY; makaron 60 g SUCHY; passata 250 g; warzywa 200 g; oliwa 10 g", "785", "71", "25", "69", "25–30 min", "4–6", "3 dni", "Tak"],
  [],
  ["Kolacja", "Egg wrap", "—", "2 jajka 120 g; białka jaj 150 g; tortilla 60 g; warzywa 100 g; ser light 20 g; salsa 50 g", "545", "45", "21", "44", "10 min", "1", "1 dzień", "Nie"],
  ["Kolacja", "Tuna sandwich", "—", "Tuńczyk 120 g odsączony; pieczywo 100 g; warzywa 150 g; jogurt 2% 50 g", "503", "49", "7", "61", "5 min", "1", "—", "Nie"],
  ["Awaryjne", "Protein bomb", "—", "Skyr 300 g; whey 30 g; banan 100 g", "407", "58", "3", "37", "2 min", "1", "—", "Nie"],
  ["Awaryjne", "Tuna wraps", "—", "Tuńczyk 130 g; tortille 120 g; salsa 100 g", "551", "45", "11", "68", "3 min", "1", "—", "Nie"],
  // Malformed on purpose: kcal is not a number.
  ["Awaryjne", "Zepsuty wiersz", "DT", "coś tam", "dużo", "40", "10", "50", "5 min", "1", "—", "Nie"],
];
