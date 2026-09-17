"use client";

import { useState } from "react";
import { Check, Home, PackageOpen } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, formatAmount, type ShoppingCategory, type Unit } from "@/lib/meals/ingredients";

export type ShoppingRow = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: ShoppingCategory;
  checked: boolean;
  owned: boolean;
};

export type StapleRow = { id: string; name: string; inStock: boolean };

/** Big one-handed rows: tap to tick off, tap the house to say you have it. */
export function ShoppingList({
  items,
  staples,
  onCheck,
  onOwn,
  onStaple,
}: {
  items: ShoppingRow[];
  staples: StapleRow[];
  onCheck: (id: string, checked: boolean) => Promise<void>;
  onOwn: (id: string, owned: boolean) => Promise<void>;
  onStaple: (id: string, inStock: boolean) => Promise<void>;
}) {
  const [rows, setRows] = useState(items);

  function update(id: string, patch: Partial<ShoppingRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  const active = rows.filter((row) => !row.owned);
  const remaining = active.filter((row) => !row.checked).length;
  const categories = [...new Set(active.map((row) => row.category))];

  return (
    <div className="flex flex-col gap-5">
      {rows.length === 0 ? (
        <Card className="items-center gap-2 py-10 text-center">
          <PackageOpen className="size-9 text-muted-foreground" />
          <p className="font-semibold">Brak listy zakupów</p>
          <p className="text-sm text-muted-foreground">Zbuduj prep, a lista zrobi się sama.</p>
        </Card>
      ) : remaining === 0 ? (
        <Card className="items-center gap-2 border-accent/30 bg-accent/5 py-8 text-center">
          <Check className="size-9 text-accent" />
          <p className="text-lg font-bold">Zakupy gotowe.</p>
        </Card>
      ) : null}

      {categories.map((category) => (
        <section key={category} className="flex flex-col gap-2">
          <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
            {CATEGORY_LABELS[category]}
          </h2>
          <Card className="gap-0 p-0">
            <ul>
              {active
                .filter((row) => row.category === category)
                .map((row) => (
                  <li key={row.id} className="flex items-stretch border-b last:border-0">
                    <button
                      type="button"
                      aria-pressed={row.checked}
                      onClick={() => {
                        update(row.id, { checked: !row.checked });
                        void onCheck(row.id, !row.checked);
                      }}
                      className="flex min-h-16 flex-1 items-center gap-3 px-4 text-left"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                          row.checked ? "border-accent bg-accent text-accent-foreground" : "border-border",
                        )}
                      >
                        {row.checked ? <Check className="size-4" strokeWidth={3} /> : null}
                      </span>
                      <span className={cn("min-w-0 flex-1", row.checked && "text-muted-foreground line-through")}>
                        <span className="block font-semibold first-letter:uppercase">{row.name}</span>
                      </span>
                      <span className="shrink-0 font-bold text-muted-foreground">
                        {formatAmount(row.quantity, row.unit as Unit | null) ?? ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Mam w domu: ${row.name}`}
                      onClick={() => {
                        update(row.id, { owned: true });
                        void onOwn(row.id, true);
                      }}
                      className="flex w-14 shrink-0 items-center justify-center border-l text-muted-foreground hover:bg-muted"
                    >
                      <Home className="size-5" />
                    </button>
                  </li>
                ))}
            </ul>
          </Card>
        </section>
      ))}

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Mam zawsze w domu</h2>
        <p className="text-sm text-muted-foreground">
          Te produkty nie trafiają na listę. Oznacz „skończyło się”, a wrócą na następną.
        </p>
        <Card className="gap-0 p-0">
          <ul>
            {staples.map((staple) => (
              <li key={staple.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
                <span className="min-w-0 flex-1 font-semibold first-letter:uppercase">{staple.name}</span>
                <button
                  type="button"
                  onClick={() => void onStaple(staple.id, !staple.inStock)}
                  className={cn(
                    "h-10 shrink-0 rounded-full px-4 text-sm font-bold transition-colors",
                    staple.inStock ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
                  )}
                >
                  {staple.inStock ? "Mam" : "Skończyło się"}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
