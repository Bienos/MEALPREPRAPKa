"use client";

import { Check, Circle, Snowflake, X } from "lucide-react";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { portionLabel, type TodayMeal } from "@/lib/meals/today-view-types";

/** The whole day in order: what is done, what is next, what is still ahead. */
export function PlanList({ meals, nextId }: { meals: TodayMeal[]; nextId: string | null }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>Plan dnia</CardTitle>
      </CardHeader>
      <ul className="flex flex-col">
        {meals.map((meal) => {
          const isNext = meal.id === nextId;
          const done = meal.status === "eaten";
          const dropped = meal.status === "skipped";
          return (
            <li
              key={meal.id}
              className={cn(
                "flex items-center gap-3 border-b border-border/60 py-3 last:border-0",
                done && "opacity-50",
                dropped && "opacity-40",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full",
                  done && "bg-accent/20 text-accent",
                  isNext && "bg-primary text-primary-foreground",
                  !done && !isNext && "text-muted-foreground",
                )}
              >
                {done ? (
                  <Check className="size-4" strokeWidth={3} />
                ) : dropped ? (
                  <X className="size-4" />
                ) : (
                  <Circle className="size-3" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{meal.slot}</p>
                <p className={cn("truncate font-semibold", done && "line-through decoration-1")}>
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
                <span className="shrink-0 text-sm text-muted-foreground">{Math.round(meal.kcal)}</span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
