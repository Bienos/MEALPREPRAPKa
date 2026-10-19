-- Frisco (online grocer): its public product feed gives a regular price for
-- almost everything on the list, as a reference next to the shops on the corner.
alter table shop_promos        drop constraint shop_promos_shop_check;
alter table shop_prices        drop constraint shop_prices_shop_check;
alter table shop_product_links drop constraint shop_product_links_shop_check;
alter table shelf_prices       drop constraint shelf_prices_shop_check;

alter table shop_promos add constraint shop_promos_shop_check check (
  shop in ('lidl', 'biedronka', 'kaufland', 'aldi', 'netto', 'dino', 'carrefour', 'auchan', 'stokrotka', 'zabka', 'leclerc', 'frisco')
);
alter table shop_prices add constraint shop_prices_shop_check check (
  shop in ('lidl', 'biedronka', 'kaufland', 'aldi', 'netto', 'dino', 'carrefour', 'auchan', 'stokrotka', 'zabka', 'leclerc', 'frisco')
);
alter table shop_product_links add constraint shop_product_links_shop_check check (
  shop in ('lidl', 'biedronka', 'kaufland', 'aldi', 'netto', 'dino', 'carrefour', 'auchan', 'stokrotka', 'zabka', 'leclerc', 'frisco')
);
alter table shelf_prices add constraint shelf_prices_shop_check check (
  shop in ('lidl', 'biedronka', 'kaufland', 'aldi', 'netto', 'dino', 'carrefour', 'auchan', 'stokrotka', 'zabka', 'leclerc', 'frisco')
);
