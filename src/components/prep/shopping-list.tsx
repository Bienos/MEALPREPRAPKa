"use client";

import { useState } from "react";
import { Check, ClipboardCopy, Home, PackageOpen, Trash2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, formatAmount, type ShoppingCategory, type Unit } from "@/lib/meals/ingredients";
import { shoppingText } from "@/lib/meals/shopping-text";

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

/**
 * Big one-handed rows: tap a row when it is in the basket, tap "Mam" when you
 * already have it at home. Done items sink to the bottom of their aisle.
 */
export function ShoppingList({
  items,
  staples,
  onCheck,
  onOwn,
  onStaple,
  onClearChecked,
}: {
  items: ShoppingRow[];
  staples: StapleRow[];
  onCheck: (id: string, checked: boolean) => Promise<void>;
  onOwn: (id: string, owned: boolean) => Promise<void>;
  onStaple: (id: string, inStock: boolean) => Promise<void>;
  onClearChecked: () => Promise<void>;
}) {
  const [rows, setRows] = useState(items);
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);

  function update(id: string, patch: Partial<ShoppingRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  const active = rows.filter((row) => !row.owned);
  const owned = rows.filter((row) => row.owned);
  const done = active.filter((row) => row.checked).length;
  const remaining = active.length - done;
  const categories = [...new Set(active.map((row) => row.category))];

  async function copy() {
    try {
      await navigator.clipboard.writeText(shoppingText(rows));
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied(null), 2500);
  }

  return (
    <div className="flex flex-col gap-5">
      {rows.length === 0 ? (
        <Card className="items-center gap-2 py-10 text-center">
          <PackageOpen className="size-9 text-muted-foreground" />
          <p className="font-semibold">Brak listy zakupów</p>
          <p className="text-sm text-muted-foreground">Zbuduj prep, a lista zrobi się sama.</p>
        </Card>
      ) : (
        <Card className={cn("gap-3 p-4", remaining === 0 && "border-accent/30 bg-accent/5")}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-lg font-extrabold">{remaining === 0 ? "Zakupy gotowe" : `Zostało ${remaining}`}</p>
            <p className="text-sm font-semibold text-muted-foreground tabular-nums">
              {done} z {active.length} w koszyku
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${active.length ? (done / active.length) * 100 : 0}%` }}
            />
          </div>
          <div className="flex gap-2">
            {remaining > 0 ? (
              <Button variant="outline" size="sm" className="flex-1" onClick={() => void copy()}>
                <ClipboardCopy className="size-4" />
                {copied === "ok" ? "Skopiowano" : copied === "failed" ? "Nie udało się" : "Skopiuj listę"}
              </Button>
            ) : null}
            {done > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setRows((current) => current.filter((row) => !row.checked));
                  void onClearChecked();
                }}
              >
                <Trash2 className="size-4" />
                Usuń kupione
              </Button>
            ) : null}
          </div>
        </Card>
      )}

      {categories.map((category) => (
        <section key={category} className="flex flex-col gap-2">
          <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
            {CATEGORY_LABELS[category]}
          </h2>
          <Card className="gap-0 p-0">
            <ul>
              {active
                .filter((row) => row.category === category)
                .sort((a, b) => Number(a.checked) - Number(b.checked))
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
                    {row.checked ? null : (
                      <button
                        type="button"
                        aria-label={`Mam w domu: ${row.name}`}
                        onClick={() => {
                          update(row.id, { owned: true });
                          void onOwn(row.id, true);
                        }}
                        className="flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 border-l text-muted-foreground hover:bg-muted"
                      >
                        <Home className="size-5" />
                        <span className="text-[0.65rem] font-bold">Mam</span>
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          </Card>
        </section>
      ))}

      {owned.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
            Mam w domu ({owned.length})
          </h2>
          <Card className="gap-0 p-0">
            <ul>
              {owned.map((row) => (
                <li key={row.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
                  <span className="min-w-0 flex-1 text-muted-foreground first-letter:uppercase">
                    {row.name}{" "}
                    <span className="text-sm">{formatAmount(row.quantity, row.unit as Unit | null) ?? ""}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      update(row.id, { owned: false });
                      void onOwn(row.id, false);
                    }}
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-muted px-4 text-sm font-bold"
                  >
                    <Undo2 className="size-4" />
                    Jednak kupić
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Zawsze w domu</h2>
        <p className="text-sm text-muted-foreground">
          Te produkty nie trafiają na listę. Gdy się skończą, dotknij „Skończyło się”, a wrócą na następną.
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
