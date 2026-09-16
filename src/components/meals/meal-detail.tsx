"use client";

import { useState } from "react";
import { Clock, Layers, Refrigerator, Snowflake } from "lucide-react";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { primaryVariant, variantLabel, type Meal } from "@/lib/meals/types";
import { VariantBadge } from "./variant-badge";

export function MealDetail({ meal }: { meal: Meal }) {
  const [selectedKey, setSelectedKey] = useState(primaryVariant(meal).key);
  const v = meal.variants.find((variant) => variant.key === selectedKey) ?? meal.variants[0];
  const ingredients = v.ingredients
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const prep = [
    { icon: Clock, label: "Czas", value: v.prepTime },
    { icon: Layers, label: "Batch", value: v.batch },
    { icon: Refrigerator, label: "Lodówka", value: v.fridgeLife },
    { icon: Snowflake, label: "Mrożenie", value: v.freezable === null ? null : v.freezable ? "Tak" : "Nie" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{meal.category}</p>
        <h1 className="text-3xl leading-tight font-extrabold tracking-tight">{meal.name}</h1>
      </header>

      {meal.variants.length > 1 ? (
        <div role="group" aria-label="Wersja" className="grid gap-2 rounded-full bg-muted p-1" style={{ gridTemplateColumns: `repeat(${meal.variants.length}, 1fr)` }}>
          {meal.variants.map((variant) => {
            const active = variant.key === v.key;
            return (
              <button
                key={variant.key}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedKey(variant.key)}
                className={cn(
                  "h-11 rounded-full text-sm font-bold transition-colors",
                  active ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {variantLabel(variant.variant)}
              </button>
            );
          })}
        </div>
      ) : (
        <VariantBadge variant={v.variant} className="self-start" />
      )}

      <Card className="gap-4 border-primary/20 bg-gradient-to-br from-card to-primary/5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-extrabold">{Math.round(v.kcal)}</span>
          <span className="text-muted-foreground">kcal</span>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Białko", v.protein_g],
            ["Tłuszcz", v.fat_g],
            ["Węgle", v.carbs_g],
          ].map(([label, grams]) => (
            <div key={label} className="rounded-lg bg-card/70 py-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-lg font-bold">{Math.round(Number(grams))} g</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Składniki</CardTitle>
        </CardHeader>
        {ingredients.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {ingredients.map((item, index) => (
              <li key={`${index}-${item}`} className="flex gap-2">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Brak składników w arkuszu.</p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Przygotowanie</CardTitle>
        </CardHeader>
        <dl className="grid grid-cols-2 gap-3">
          {prep.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-start gap-2">
              <Icon className="mt-0.5 size-4 text-primary" />
              <div>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-semibold">{value ?? "—"}</dd>
              </div>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
