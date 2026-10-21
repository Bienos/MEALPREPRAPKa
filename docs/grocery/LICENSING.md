# Licensing and permissions

This is a record of what each source allows, as found on 20.10.2026. It is not legal advice.

## Principles applied in code

- A technically reachable endpoint is not a permission. robots.txt allowing a path permits crawling it; it
  does not license reuse of the data.
- Sources without permission on record are not read unless the owner turns them on
  (`GROCERY_UNVERIFIED_SOURCES=on`, private use only), and their prices never count as verified.
- Nothing bypasses authentication, rate limits, robots rules or bot protection (Auchan's 202 "slow down"
  stops the read; Kaufland and Carrefour, which refuse plain requests, are not read at all).
- No private retailer API, consumer account or app is automated.

## Per source

| Source | Terms | What the app does |
|---|---|---|
| Open Food Facts | ODbL database, DbCL contents, CC BY-SA images; credit the source | Stores metadata per barcode with source URL; shows "Dane produktu: Open Food Facts (ODbL)" |
| Open Prices | ODbL; mention the source; share-alike for a derived database that is made public | Keeps Open Prices rows separate (provider `open-prices`, evidence links to each price page), credits them on screen, does not publish a derived database |
| Frisco feed | robots.txt invites personal, non-commercial use of the feed | Used because the app is private and non-commercial; disabled automatically for `APP_USE = "commercial"` |
| Lidl leaflet (everyday prices) | Public retailer publication | 52 prices typed by hand for personal use |
| lidl.pl, Blix, Biedronka/Auchan online, Stokrotka feed | No permission on record | Off by default |
| GS1 eProdukty | Contract | Not used |

## ODbL and mixed data

Open data (Open Food Facts, Open Prices) and other data are kept apart: separate provider ids, separate
evidence, separate rows. The app does not redistribute a combined database. Before any public release that
shows or exports a database derived from Open Prices together with other data, get legal advice on the
share-alike obligation.

## Contributions

Receipt lines the owner chooses to share are exported as a CSV by the owner. Uploading them to Open Prices
would make them ODbL data; the receipts screen says so. Nothing is uploaded by the app.

## Before a public or commercial deployment

- Frisco: get permission for commercial display, or stop using the feed.
- Every "unverified" source: written permission or a licence, or remove it.
- Open Prices/OFF: an ODbL review of how data is combined and displayed.
- Receipts: a GDPR assessment (see OPERATIONS.md, "Going multi-user").
