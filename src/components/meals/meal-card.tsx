import Link from "next/link";
import { Snowflake } from "lucide-react";

import { macroSummary, primaryVariant, type Meal } from "@/lib/meals/types";
import { MealImage } from "./meal-image";

/** One tile of the library grid: picture, name, calories and protein. */
export function MealCard({ meal, ready }: { meal: Meal; ready: number }) {
  const v = primaryVariant(meal);

  return (
    <Link
      href={`/meals/${meal.key}`}
      className="flex flex-col gap-2 rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98]"
    >
      <div className="relative">
        <MealImage name={meal.name} category={meal.category} className="aspect-square w-full rounded-2xl" />
        {ready > 0 ? (
          <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-xs font-bold text-accent shadow-sm">
            <Snowflake className="size-3" />×{ready}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-0.5 px-0.5">
        <h2 className="line-clamp-2 leading-tight font-bold">{meal.name}</h2>
        <p className="text-xs text-muted-foreground tabular-nums">
          {Math.round(v.kcal)} kcal · {macroSummary(v)}
        </p>
      </div>
    </Link>
  );
}
