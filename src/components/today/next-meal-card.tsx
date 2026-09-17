"use client";

import { Check, Repeat, Snowflake } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { macroLine, portionLabel, type TodayMeal } from "@/lib/meals/today-view-types";
import { PortionPicker } from "./portion-picker";

/** The strongest card on the screen: what to eat next, and one tap to log it. */
export function NextMealCard({
  meal,
  onEaten,
  onPortions,
  onSwap,
}: {
  meal: TodayMeal;
  onEaten: () => void;
  onPortions: (portions: number) => void;
  onSwap: () => void;
}) {
  return (
    <Card className="gap-5 border-primary/25 bg-gradient-to-br from-card to-primary/5 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-widest text-primary uppercase">Teraz</p>
          <h2 className="mt-1 text-2xl leading-tight font-extrabold">{meal.mealName}</h2>
          <p className="text-sm text-muted-foreground">
            {meal.slot}
            {meal.variant ? ` · ${meal.variant}` : ""}
            {meal.portions !== 1 ? ` · ${portionLabel(meal.portions)}` : ""}
          </p>
        </div>
        {meal.prepared ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-bold text-accent">
            <Snowflake className="size-3.5" />
            GOTOWE
          </span>
        ) : null}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-extrabold">{Math.round(meal.kcal)}</span>
        <span className="text-muted-foreground">kcal</span>
        <span className="ml-auto text-sm font-semibold text-muted-foreground">{macroLine(meal)}</span>
      </div>

      <Button size="lg" className="h-16 w-full text-xl" onClick={onEaten}>
        <Check className="size-7" />
        ZJEDZONE
      </Button>

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onSwap}>
          <Repeat />
          Zamień
        </Button>
        <PortionPicker portions={meal.portions} onChange={onPortions} />
      </div>
    </Card>
  );
}
