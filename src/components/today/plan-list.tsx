"use client";

import { Check, ChevronRight, Snowflake } from "lucide-react";

import { MealImage } from "@/components/meals/meal-image";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { isEaten, portionLabel, type TodayMeal } from "@/lib/meals/today-view-types";

/**
 * The whole day in order: what is done, what is next, what is still ahead.
 * Every row opens the meal sheet, where portion and calories can be changed.
 */
export function PlanList({
  meals,
  nextId,
  onSelect,
}: {
  meals: TodayMeal[];
  nextId: string | null;
  onSelect: (meal: TodayMeal) => void;
}) {
  return (
    <Card className="gap-1 pb-2">
      <CardHeader>
        <CardTitle>Plan dnia</CardTitle>
      </CardHeader>
      <ul className="flex flex-col">
        {meals.map((meal) => {
          const isNext = meal.id === nextId;
          const done = isEaten(meal);
          const dropped = meal.status === "skipped";
          return (
            <li key={meal.id} className="border-b border-border/60 last:border-0">
              <button
                type="button"
                onClick={() => onSelect(meal)}
                className={cn(
                  "flex w-full items-center gap-3 py-2.5 text-left outline-none focus-visible:bg-muted/60",
                  dropped && "opacity-40",
                )}
              >
                <div className="relative">
                  <MealImage
                    name={meal.mealName}
                    category={meal.slot}
                    className={cn("size-12 rounded-xl", done && "opacity-50")}
                  />
                  {done ? (
                    <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-accent text-accent-foreground ring-2 ring-card">
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{meal.slot}</p>
                  <p className={cn("truncate font-semibold", done && "text-muted-foreground")}>
                    {meal.mealName}
                    {meal.portions !== 1 ? (
                      <span className="font-normal text-muted-foreground"> {portionLabel(meal.portions)}</span>
                    ) : null}
                  </p>
                </div>

                {meal.prepared && !done ? <Snowflake className="size-4 shrink-0 text-accent" /> : null}
                {isNext ? (
                  <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                    TERAZ
                  </span>
                ) : (
                  <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{Math.round(meal.kcal)}</span>
                )}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
