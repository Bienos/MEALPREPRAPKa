"use client";

import { Check, Repeat, Snowflake } from "lucide-react";

import { MealImage } from "@/components/meals/meal-image";
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
    <Card className="gap-4 overflow-hidden border-primary/25 p-0">
      <div className="relative">
        <MealImage name={meal.mealName} category={meal.slot} className="aspect-[16/9] w-full" priority />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/45 to-transparent px-4 pt-10 pb-3">
          <p className="text-xs font-extrabold tracking-widest text-white uppercase">
            Teraz · {meal.slot}
            {meal.variant ? ` · ${meal.variant}` : ""}
          </p>
          {meal.prepared ? (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-accent">
              <Snowflake className="size-3.5" />Z lodówki
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 pb-5">
        <div className="flex items-start gap-3">
          <h2 className="min-w-0 flex-1 text-2xl leading-tight font-extrabold">
            {meal.mealName}
            {meal.portions !== 1 ? (
              <span className="ml-1.5 text-base font-bold text-muted-foreground">{portionLabel(meal.portions)}</span>
            ) : null}
          </h2>
          <div className="shrink-0 text-right">
            <p className="text-2xl leading-none font-extrabold tabular-nums">{Math.round(meal.kcal)}</p>
            <p className="text-xs font-semibold text-muted-foreground">kcal</p>
          </div>
        </div>
        <p className="-mt-2 text-sm font-semibold text-muted-foreground">{macroLine(meal)}</p>

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
      </div>
    </Card>
  );
}
