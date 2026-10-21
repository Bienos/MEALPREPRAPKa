# Shopping intelligence

> **21.10.2026:** ten dokument opisuje źródła z 20.10. Aktualny stan uprawnień, weryfikacji cen, koszyka i
> paragonów jest w `docs/grocery/` (ARCHITECTURE, DATA_SOURCES, LICENSING). Najważniejsze zmiany: źródła bez
> potwierdzonej zgody (lidl.pl, Blix, Biedronka i Auchan online, Stokrotka) są domyślnie wyłączone
> (`GROCERY_UNVERIFIED_SOURCES`), Frisco ma zgodę na użytek osobisty (robots.txt), a Open Prices ma jednak
> polskie dane (ok. 1800 cen, głównie Warszawa) i jest używane jako historia.

Jak MealPrep liczy, gdzie zakupy z planu wychodzą najtaniej, skąd bierze ceny i czego nie wie.
Stan na 20.10.2026. To dokument o faktach: każda pozycja poniżej była sprawdzona zwykłym publicznym
zapytaniem z tego projektu, bez logowania, captchy i przeglądarki. Niczego, co blokuje dostęp, nie obchodzimy.

## Architektura

```
Google Sheets (dania)  ->  lista zakupów (ingredients.ts, prep.ts)
                                   |
   źródła cen (src/lib/prices/*.ts) -> Supabase: shop_promos, shelf_prices, shop_prices,
                                       shop_product_links, delivery_quotes, price_observations,
                                       source_refreshes
                                   |
   match.ts (reguły + "Tak/Nie")  ->  basket.ts (koszyk per sklep)  ->  delivery.ts (dostawa)
                                   |
   Zakupy / Plan tygodnia: karta "Gdzie najtaniej?" (Sklepy, Dostawa), Promocje tygodnia
```

- **Ceny są obserwacjami**, nie faktami o sklepie na rogu: każda ma źródło, dzień odczytu (`fetchedAt`), ważność
  i link (`source.ts`). Ekran mówi "szacunek", "zakładam 500 g", "cena z półki (sklep online)", "potwierdzona".
- **Koszyk** (`basket.ts`): całe opakowania zaokrąglane w górę, towar na wagę dokładnie, multibuy w pełnych
  wielokrotnościach, sumy tylko z wycenionych pozycji i zawsze z liczbą pozycji bez ceny. Sklepy porównuje się
  na pozycjach, które wyceniają wszystkie (`compared`), a "taniej" pada tylko przy ≥60% pokrycia.
- **Dostawa** (`delivery.ts`): sklepy online (Frisco, Auchan, Biedronka, Stokrotka) liczone na tym samym koszyku,
  plus opłata: z ich strony o dostawie (szacunek, z linkiem i datą) albo wpisana z koszyka (potwierdzona).
  Nigdy nie zgadywana: nieznana opłata to "+ dostawa ?" i brak sumy. Minimum zamówienia i miasto dostawy
  (`settings.shopping_city`, domyślnie Warszawa, bez adresu) decydują, czy opcja w ogóle wchodzi w grę.
- **Najlepsze opcje** (`bestOptions`): najtańszy spośród najpełniejszych sklepów (nigdy ten z trzema cenami),
  najtańsza dostawa ze znaną sumą, podział na dwa sklepy, gdy coś oszczędza.
- **Historia cen**: triggery w bazie dopisują każdą nową cenę do `price_observations` (`listPriceHistory`).

## Źródła: macierz

| Źródło | Adres | Dostęp | Typ ceny | Zasięg | Odświeżanie | Limity / licencja | Stan |
|---|---|---|---|---|---|---|---|
| Blix (gazetki 11 sieci) | blix.pl | publiczny JSON stron (robots zabrania tylko `/api/*`) | promocje | cała Polska | co tap / cron; pełny przegląd raz na 12 h (~150 stron, 4 naraz) | użytek własny; serwis osób trzecich | SUPPORTED |
| Lidl (lidl.pl) | lidl.pl | publiczny JSON stron | ~30 promocji | PL | co tap / cron | robots zabrania wyszukiwarki i paginacji, nie używamy | PARTIALLY SUPPORTED |
| Lidl "Rewolucja cenowa" | lidl.pl/l/pl/gazetki/... | obrazy gazetki (tekst API to zbiór słów) | ceny regularne, 52 produkty, do 31.12.2026 | PL (ceny jednakowe) | ręcznie przepisane 20.10.2026 | - | PARTIALLY SUPPORTED |
| Biedronka sklep online | zakupy.biedronka.pl | sitemapa + strony kategorii i produktów | cena z półki online | miasta z dostawą | strony kategorii 3 dni, produkty 14 dni | robots zabrania wyszukiwania/filtrów, nie używamy | SUPPORTED |
| Auchan sklep online | zakupy.auchan.pl | sitemapa kategorii (w robots.txt) + strony kategorii (JSON w stanie strony) | cena z półki online | miasta z dostawą | 3 dni / kategoria, do 40 stron na raz, 2 naraz | ochrona odpowiada 202 przy zbyt szybkich zapytaniach: zatrzymujemy się i czekamy | SUPPORTED (z limitem) |
| Stokrotka | sklep.stokrotka.pl/xml/google_products.xml | feed Google Merchant dozwolony w robots.txt | cena z półki online | miasta z dostawą | 12 h | - | SUPPORTED |
| Frisco | commerce.frisco.pl/api/v1/integration/feeds/public | publiczny feed wskazany w robots.txt | cena z półki online (~15 000 produktów) | Warszawa i duże miasta | 12 h | - | SUPPORTED |
| Kaufland, Carrefour (sklepy online) | - | blokują zwykłe zapytania, także sitemapy | - | - | - | nie obchodzimy | NOT FEASIBLE |
| Aldi, Dino, Netto, Leclerc, Intermarché, Żabka | - | brak publicznego katalogu z cenami | tylko gazetki (Blix) | - | - | - | PARTIALLY SUPPORTED (gazetki) |
| Ding, Gazetki.pl, Gazetkowo, Promo-Skaner, Tańszy Koszyk | ding.pl, gazetki.pl, gazetkowo.pl, promo-skaner.pl, tanszykoszyk.pl | strony publiczne | te same gazetki co Blix; Promo-Skaner i Tańszy Koszyk dodają wagi, cenę za kg i historię | PL | - | ich własne zastrzeżenie: "ceny informacyjne" | UNVERIFIED jako źródło (brak nowych cen), możliwe uzupełnienie wag |
| delio | delio.pl | strona nieosiągalna z tego środowiska | - | - | - | - | UNVERIFIED |
| Lisek | lisek.app | ceny dopiero po podaniu adresu w aplikacji | - | duże miasta, darmowa dostawa od 120 zł | - | - | PARTNER ACCESS REQUIRED (tylko link) |
| Żabka Jush | jush.pl | tylko aplikacja | - | - | - | - | PARTNER ACCESS REQUIRED (tylko link) |
| Glovo | glovoapp.com | strona sklepu bez adresu pokazuje ~20 promocji; pełny katalog po adresie/logowaniu | - | - | - | regulamin zabrania automatyzacji | PARTNER ACCESS REQUIRED (tylko link) |
| Wolt | wolt.com | 429/404 dla sklepów spożywczych; API tylko restauracje | - | - | - | - | PARTNER ACCESS REQUIRED (tylko link) |
| Uber Eats | ubereats.com | 403 | - | - | - | - | NOT FEASIBLE |
| Pyszne.pl | pyszne.pl | 403 | - | - | - | - | NOT FEASIBLE |
| Open Prices (OFF) | prices.openfoodfacts.org | REST API, ODbL | społecznościowe (historia) | 2176 cen w PLN (20.10.2026), 538 w promieniu 25 km od Warszawy | codziennie | ODbL | SUPPORTED jako historia (docs/grocery) |
| openfoodfacts/open-prices (HF) | huggingface.co/datasets/openfoodfacts/open-prices | parquet, ODbL | jw. | jw. | dziennie | ODbL | NOT FEASIBLE dziś |
| Open Food Facts (produkty) | world.openfoodfacts.org | REST, ODbL | brak cen; EAN i nazwy | świat | - | ODbL | możliwe do dopasowań po EAN (nie wdrożone) |
| jjwallace/polski-price | GitHub | kod (Bun + Gemini) uśredniający gazetki | średnie z gazetek | PL | - | zależny od Gemini; inne podejście niż nasze reguły | UNVERIFIED (nie reużyte) |
| AgnieszkaMaleszka/Promotion-api | GitHub | Spring Boot nad blix.com, "edukacyjny, niekomercyjny" | gazetki | PL | - | tylko nauka | NOT FEASIBLE (ta sama treść co nasz adapter) |
| pepesto.com | pepesto.com | komercyjne API, płatne | - | - | - | umowa | PARTNER ACCESS REQUIRED |
| Lidl Plus, Moja Biedronka, Żappka (aplikacje) | - | wymagają konta i 2FA, brak publicznego API | kupony | - | - | regulaminy zabraniają automatyzacji | NOT FEASIBLE (zrzuty ekranu można przepisać ręcznie) |

Koszt operacyjny wszystkich wdrożonych źródeł: 0 zł (Vercel hobby + Supabase free; brak płatnych API).

## Odświeżanie

- **Cron**: `vercel.json` → `GET /api/refresh-prices` codziennie 04:00 UTC, nagłówek `Authorization: Bearer $CRON_SECRET`
  (401 bez, 503 gdy nieskonfigurowany). Wszystkie źródła równolegle, każde z własnym budżetem, w 60 s.
- **Na żądanie**: "Sprawdź promocje" na Zakupach, "Odśwież" na Promocjach (trzy wywołania po kolei).
- **Samoczynnie**: ekran Promocji odświeża dane starsze niż 12 h przy otwarciu.
- **Przyrostowo**: Blix pełny przegląd raz na 12 h (`source_refreshes`), feedy 12 h, strony kategorii 3 dni
  (`cat:{sklep}:{url}`), strony produktów Biedronki 14 dni. Oferty są upsertowane, wygasłe kasowane; awaria
  jednego źródła nigdy nie kasuje danych innego. Auchan: przy sygnale "zwolnij" (202) odczyt staje, reszta czeka.
- **Świeżość na ekranie**: każda cena pokazuje dzień odczytu; ceny z półki liczą się 30 dni; promocje do końca ważności.

## Ograniczenia danych

- Ceny sklepów online to ceny w internecie; w sklepie stacjonarnym mogą się różnić (ekran to zaznacza).
- Gazetki to tylko promocje; cena regularna świeżego mięsa i jaj w Lidlu nie jest nigdzie publikowana.
- Oferta bez wagi dostaje "zwykłą" wagę produktu (oznaczone "zakładam"); "Tak" przy produkcie robi ją dokładną.
- Opłaty za dostawę: Frisco (14 zł od 100 do 300 zł, darmowa od 300) i minima (Frisco, Auchan 100 zł) są z ich
  stron z 20.10.2026; Biedronka i Stokrotka online nie podają opłaty publicznie, trzeba ją wpisać.
- Lokalizacja: tylko miasto, bez adresu i bez uprawnień do położenia.

## Prawo i licencje

- Odczytujemy wyłącznie strony i feedy dostępne bez logowania, w granicach robots.txt każdego serwisu, powoli
  i rzadko. Nie obchodzimy captchy, blokad ani limitów; nie automatyzujemy kont konsumenckich.
- Użytek prywatny jednej osoby; dane nie są publikowane dalej. Open Prices (ODbL) nie jest używane.

## Zmienne środowiskowe

Jak w `DEPLOY.md`, plus `CRON_SECRET` (dowolny długi losowy ciąg) dla codziennego odświeżania.
Opcjonalnie `ANTHROPIC_API_KEY` (szacowanie makro w "Dodaj", nie dla cen).

## Uruchomienie i testy

```
npm install
npm run lint && npm run typecheck && npm test && npm run build
```

Testy czyste (bez sieci) pokrywają: parsery każdego źródła na zapisanych odpowiedziach (`src/lib/prices/fixtures/`),
reguły dopasowań, koszyk (opakowania, multibuy, brak cen, pokrycie, podział), dostawę (opłaty, minimum, miasto,
najlepsze opcje), promocje tygodnia, wyróżnienia, źródła cen, listę zakupów (jajka, warzywa, owoce).

## Co dalej (nie zrobione)

- EAN/GTIN z Frisco i Auchan (oba podają kody) jako klucz dopasowań między sklepami, z Open Food Facts do nazw.
- Historia cen na ekranie ("najniższa od września") z `price_observations`; Tańszy Koszyk jako uzupełnienie wag.
- Wagi z Promo-Skanera dla ofert bez wagi.
- Zdjęcia kuponów z aplikacji sklepów przepisywane ręcznie jako źródło "aplikacja, zrzut z dnia".
