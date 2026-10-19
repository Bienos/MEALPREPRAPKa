-- Żabka and Leclerc leaflets (read through Blix) join the other chains.
-- Shops stay code constants (src/lib/prices/types.ts); this lists them all.

alter table shop_promos        drop constraint shop_promos_shop_check;
alter table shop_prices        drop constraint shop_prices_shop_check;
alter table shop_product_links drop constraint shop_product_links_shop_check;

alter table shop_promos add constraint shop_promos_shop_check check (
  shop in ('lidl', 'biedronka', 'kaufland', 'aldi', 'netto', 'dino', 'carrefour', 'auchan', 'stokrotka', 'zabka', 'leclerc')
);
alter table shop_prices add constraint shop_prices_shop_check check (
  shop in ('lidl', 'biedronka', 'kaufland', 'aldi', 'netto', 'dino', 'carrefour', 'auchan', 'stokrotka', 'zabka', 'leclerc')
);
alter table shop_product_links add constraint shop_product_links_shop_check check (
  shop in ('lidl', 'biedronka', 'kaufland', 'aldi', 'netto', 'dino', 'carrefour', 'auchan', 'stokrotka', 'zabka', 'leclerc')
);
