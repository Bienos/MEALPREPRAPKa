-- Leaflet promotions from every chain (read through Blix), and the pack a
-- "pasuje? tak" answer gives an offer that does not say what its price is for.
-- Shops stay code constants (src/lib/prices/types.ts); this lists them all.

alter table shop_promos        drop constraint shop_promos_shop_check;
alter table shop_prices        drop constraint shop_prices_shop_check;
alter table shop_product_links drop constraint shop_product_links_shop_check;

alter table shop_promos add constraint shop_promos_shop_check check (
  shop in ('lidl', 'biedronka', 'kaufland', 'aldi', 'netto', 'dino', 'carrefour', 'auchan', 'stokrotka')
);
alter table shop_prices add constraint shop_prices_shop_check check (
  shop in ('lidl', 'biedronka', 'kaufland', 'aldi', 'netto', 'dino', 'carrefour', 'auchan', 'stokrotka')
);
alter table shop_product_links add constraint shop_product_links_shop_check check (
  shop in ('lidl', 'biedronka', 'kaufland', 'aldi', 'netto', 'dino', 'carrefour', 'auchan', 'stokrotka')
);

-- What the confirmed offer's price is for, when the offer itself did not say:
-- "500 g", or "1 kg na wagę" (pack_loose: I pay for what I take).
alter table shop_product_links
  add column pack_quantity numeric(10,2) check (pack_quantity > 0),
  add column pack_unit     text check (pack_unit in ('g', 'ml', 'szt')),
  add column pack_loose    boolean not null default false,
  add constraint shop_product_links_pack_check check ((pack_quantity is null) = (pack_unit is null));
