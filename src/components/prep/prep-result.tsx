"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Clock, Play, Plus, Repeat, ShoppingBasket, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { groupIntoDishes, type PrepDishView, type PrepItemView } from "@/lib/meals/prep-view-types";

export type Alternative = { mealKey: string; mealName: string; kcal: number; protein_g: number };

/** The generated prep: what to cook, how long, and the way into cooking mode. */
export function PrepResult({
  days,
  slotLabel,
  items,
  estimatedMinutes,
  fromFridge,
  shoppingCount,
  short,
  onStart,
  onAlternatives,
  onSwap,
  onDiscard,
  onBrowse,
  onAdd,
  onRemove,
}: {
  days: number;
  slotLabel: string;
  items: PrepItemView[];
  estimatedMinutes: number;
  fromFridge: number;
  shoppingCount: number;
  short: boolean;
  onStart: () => Promise<void>;
  onAlternatives: (itemId: string) => Promise<Alternative[]>;
  onSwap: (itemId: string, mealKey: string) => Promise<void>;
  onDiscard: () => Promise<void>;
  onBrowse: () => Promise<Alternative[]>;
  onAdd: (mealKey: string) => Promise<void>;
  onRemove: (mealKey: string) => Promise<void>;
}) {
  const dishes = groupIntoDishes(items);
  const totalPortions = items.reduce((sum, item) => sum + item.portions, 0);
  const [pending, startTransition] = useTransition();
  const [browsing, setBrowsing] = useState<Alternative[] | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-bold tracking-widest text-primary uppercase">
          {slotLabel} · {days} dni
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight">{totalPortions} porcji</h1>
        <p className="text-muted-foreground">
          {dishes.length === 1 ? "1 danie" : `${dishes.length} dania`}
          {fromFridge > 0 ? ` · ${fromFridge} już w lodówce` : ""}
        </p>
      </header>

      {short ? (
        <p className="rounded-lg bg-primary/10 px-4 py-3 text-sm">
          Biblioteka nie pokrywa wszystkich dni. Dodaj dania ręcznie albo dopisz więcej w arkuszu
          (kategoria „{slotLabel}”, z batchem i czasem w lodówce).
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {dishes.map((dish) => (
          <DishCard
            key={dish.mealKey}
            dish={dish}
            onAlternatives={onAlternatives}
            onSwap={onSwap}
            onRemove={onRemove}
          />
        ))}
      </ul>

      {browsing === null ? (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => startTransition(async () => { setBrowsing(await onBrowse()); })}
        >
          <Plus className="size-4" />
          {pending ? "Szukam…" : "Dodaj danie"}
        </Button>
      ) : (
        <Card className="gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
              Cała biblioteka · {browsing.length}
            </p>
            <button
              type="button"
              onClick={() => setBrowsing(null)}
              className="text-sm font-semibold text-muted-foreground underline-offset-2 hover:underline"
            >
              Zamknij
            </button>
          </div>
          {browsing.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nic więcej w tej kategorii nie nadaje się na batch.
            </p>
          ) : (
            <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
              {browsing.map((option) => (
                <li key={option.mealKey}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => startTransition(async () => { await onAdd(option.mealKey); setBrowsing(null); })}
                    className="flex min-h-12 w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left hover:bg-muted"
                  >
                    <Plus className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 font-semibold">{option.mealName}</span>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {Math.round(option.kcal)} kcal · {Math.round(option.protein_g)} B
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card className="gap-3">
        <div className="flex items-center gap-3">
          <Clock className="size-5 shrink-0 text-primary" />
          <span className="flex-1 font-semibold">Szacowany czas</span>
          <span className="text-xl font-extrabold">~{estimatedMinutes} min</span>
        </div>
        <Link
          href="/prep/zakupy"
          className="flex items-center gap-3 border-t pt-3 text-left"
        >
          <ShoppingBasket className="size-5 shrink-0 text-accent" />
          <span className="flex-1 font-semibold">Lista zakupów</span>
          <span className="flex items-center gap-1 text-sm font-semibold text-accent">
            {shoppingCount > 0 ? `${shoppingCount} pozycji` : "gotowa"}
            <Check className="size-4" />
          </span>
        </Link>
      </Card>

      <Button
        size="lg"
        className="h-16 w-full text-xl"
        disabled={pending || items.length === 0}
        onClick={() => startTransition(async () => { await onStart(); })}
      >
        <Play className="size-6" />
        {pending ? "Otwieram…" : "ZACZNIJ GOTOWANIE"}
      </Button>

      <button
        type="button"
        onClick={() => startTransition(async () => { await onDiscard(); })}
        className="text-sm font-semibold text-muted-foreground underline-offset-2 hover:underline"
      >
        Zacznij od nowa
      </button>
    </div>
  );
}

function DishCard({
  dish,
  onAlternatives,
  onSwap,
  onRemove,
}: {
  dish: PrepDishView;
  onAlternatives: (itemId: string) => Promise<Alternative[]>;
  onSwap: (itemId: string, mealKey: string) => Promise<void>;
  onRemove: (mealKey: string) => Promise<void>;
}) {
  const [options, setOptions] = useState<Alternative[] | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <li>
      <Card className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg leading-tight font-bold">{dish.mealName}</h2>
            <p className="text-sm text-muted-foreground">{dish.totalPortions} porcji</p>
          </div>
          <ul className="flex shrink-0 flex-col items-end gap-1">
            {dish.split.map((part, index) => (
              <li key={`${part.variant}-${index}`} className="text-sm font-semibold">
                {part.portions} ×{" "}
                <span className={cn(part.variant === "DT" ? "text-primary" : "text-accent")}>
                  {part.variant ?? "uniw."}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {options === null ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setOptions(await onAlternatives(dish.itemId));
                })
              }
            >
              <Repeat className="size-4" />
              {pending ? "Szukam…" : "Zamień danie"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Usuń ${dish.mealName}`}
              disabled={pending}
              onClick={() => startTransition(async () => { await onRemove(dish.mealKey); })}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak alternatyw w bibliotece.</p>
        ) : (
          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Zamień na</p>
            {options.map((option) => (
              <button
                key={option.mealKey}
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => { await onSwap(dish.itemId, option.mealKey); })}
                className="flex min-h-12 items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left hover:bg-muted"
              >
                <span className="min-w-0 flex-1 font-semibold">{option.mealName}</span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {Math.round(option.kcal)} kcal · {Math.round(option.protein_g)} B
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOptions(null)}
              className="self-start text-sm font-semibold text-muted-foreground underline-offset-2 hover:underline"
            >
              Zostaw jak jest
            </button>
          </div>
        )}
      </Card>
    </li>
  );
}

export function PrepEmpty() {
  return (
    <Card className="items-center gap-2 py-10 text-center">
      <CardHeader className="items-center">
        <CardTitle>Nic do ugotowania</CardTitle>
        <CardDescription>
          Wszystkie porcje na te dni masz już w lodówce.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
