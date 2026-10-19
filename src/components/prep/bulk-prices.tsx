"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { formatAmount, type Unit } from "@/lib/meals/ingredients";
import type { NeededItem } from "@/lib/prices/basket";
import { priceKey } from "@/lib/prices/match";
import { SHOP_LABELS, SHOPS, type Shop, type ShopPrice } from "@/lib/prices/types";
import { cn } from "@/lib/utils";

/** The shops I actually go to come first. */
const SHOP_ORDER: Shop[] = [
  "lidl",
  "biedronka",
  "auchan",
  "zabka",
  ...SHOPS.filter((shop) => !["lidl", "biedronka", "auchan", "zabka"].includes(shop)),
];
const UNITS: Unit[] = ["g", "ml", "szt"];

type Fields = { price: string; quantity: string; unit: Unit };

/**
 * "Wpisz ceny": the whole list at one shop on one screen. Pick the shop, type a
 * price and a pack next to each item, save everything at once. A pack typed at
 * one shop is offered at the others, since the same product usually comes in
 * the same pack. Prices already saved are shown and stay until changed.
 */
export function BulkPrices({
  open,
  onClose,
  items,
  prices,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  items: NeededItem[];
  prices: ShopPrice[];
  onSave: (prices: ShopPrice[]) => void;
}) {
  const [shop, setShop] = useState<Shop>("lidl");
  const [drafts, setDrafts] = useState<Record<string, Fields>>({});
  const [packs, setPacks] = useState<Record<string, { quantity: string; unit: Unit }>>({});

  const keyOf = (shopId: Shop, item: NeededItem) => `${shopId}|${priceKey(item.name)}`;
  const savedFor = (shopId: Shop, item: NeededItem) =>
    prices.find((price) => price.shop === shopId && price.itemName === priceKey(item.name)) ?? null;

  /** What the row shows: my edit, else the saved price, else the pack used for this item elsewhere. */
  function fieldsFor(shopId: Shop, item: NeededItem): Fields {
    const draft = drafts[keyOf(shopId, item)];
    if (draft) return draft;
    const saved = savedFor(shopId, item);
    if (saved)
      return { price: decimalText(saved.price), quantity: decimalText(saved.packQuantity), unit: saved.packUnit };
    const elsewhere = packs[priceKey(item.name)];
    const known = prices.find((price) => price.itemName === priceKey(item.name));
    return {
      price: "",
      quantity: elsewhere?.quantity ?? (known ? decimalText(known.packQuantity) : ""),
      unit: elsewhere?.unit ?? known?.packUnit ?? item.unit ?? "g",
    };
  }

  function edit(item: NeededItem, patch: Partial<Fields>) {
    const next = { ...fieldsFor(shop, item), ...patch };
    setDrafts((current) => ({ ...current, [keyOf(shop, item)]: next }));
    if (patch.quantity !== undefined || patch.unit !== undefined) {
      setPacks((current) => ({ ...current, [priceKey(item.name)]: { quantity: next.quantity, unit: next.unit } }));
    }
  }

  const ready = Object.entries(drafts).flatMap(([key, fields]) => {
    const [shopId, itemName] = [key.slice(0, key.indexOf("|")) as Shop, key.slice(key.indexOf("|") + 1)];
    const price = parseDecimal(fields.price);
    const quantity = parseDecimal(fields.quantity);
    if (price === null || price <= 0 || quantity === null || quantity <= 0) return [];
    const saved = prices.find((existing) => existing.shop === shopId && existing.itemName === itemName);
    if (saved && saved.price === price && saved.packQuantity === quantity && saved.packUnit === fields.unit) return [];
    return [
      {
        itemName,
        shop: shopId,
        productLabel: saved?.productLabel ?? "",
        packQuantity: quantity,
        packUnit: fields.unit,
        price,
      } satisfies ShopPrice,
    ];
  });

  const filledAt = (shopId: Shop) =>
    items.filter((item) => {
      const draft = drafts[keyOf(shopId, item)];
      return draft ? parseDecimal(draft.price) !== null : savedFor(shopId, item) !== null;
    }).length;

  function save() {
    onSave(ready);
    setDrafts({});
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Wpisz ceny">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Wybierz sklep i wpisz cenę z półki oraz opakowanie. Cena zostaje, aż ją zmienisz. Puste pola zostają bez ceny.
        </p>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label="Sklep">
          {SHOP_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={shop === option}
              onClick={() => setShop(option)}
              className={cn(
                "flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-bold",
                shop === option ? "border-primary bg-primary/10 text-primary" : "bg-card",
              )}
            >
              {SHOP_LABELS[option]}
              <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                {filledAt(option)}/{items.length}
              </span>
            </button>
          ))}
        </div>

        <ul className="rounded-xl border bg-card">
          {items.map((item) => {
            const fields = fieldsFor(shop, item);
            const amount = formatAmount(item.quantity, item.unit);
            return (
              <li key={item.id} className="flex flex-col gap-2 border-b px-4 py-3 last:border-0">
                <p className="font-semibold first-letter:uppercase">
                  {item.name}{" "}
                  {amount ? <span className="text-sm font-normal text-muted-foreground">{amount}</span> : null}
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    inputMode="decimal"
                    aria-label={`Cena: ${item.name}`}
                    placeholder="zł"
                    value={fields.price}
                    onChange={(event) => edit(item, { price: event.target.value })}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">za</span>
                  <Input
                    inputMode="decimal"
                    aria-label={`Opakowanie: ${item.name}`}
                    placeholder={fields.unit === "szt" ? "10" : "500"}
                    value={fields.quantity}
                    onChange={(event) => edit(item, { quantity: event.target.value })}
                    className="w-20"
                  />
                  <select
                    aria-label={`Jednostka: ${item.name}`}
                    value={fields.unit}
                    onChange={(event) => edit(item, { unit: event.target.value as Unit })}
                    className="h-12 rounded-lg border border-input bg-card px-2 text-base"
                  >
                    {UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            );
          })}
        </ul>

        <Button disabled={ready.length === 0} onClick={save}>
          {ready.length === 0 ? "Zapisz ceny" : `Zapisz ${ready.length} ${ready.length === 1 ? "cenę" : "cen"}`}
        </Button>
      </div>
    </Sheet>
  );
}

function decimalText(value: number): string {
  return String(value).replace(".", ",");
}

function parseDecimal(text: string): number | null {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() === "" || !Number.isFinite(value) ? null : value;
}
