import Link from "next/link";
import { Clock, Layers, Refrigerator, Snowflake } from "lucide-react";

import { Card } from "@/components/ui/card";
import { macroSummary, primaryVariant, type Meal } from "@/lib/meals/types";
import { VariantBadge } from "./variant-badge";

export function MealCard({ meal }: { meal: Meal }) {
  const v = primaryVariant(meal);
  const meta = [
    v.prepTime && { icon: Clock, text: v.prepTime },
    v.batch && { icon: Layers, text: `Batch: ${v.batch}` },
    v.fridgeLife && { icon: Refrigerator, text: `Lodówka: ${v.fridgeLife}` },
    v.freezable === true && { icon: Snowflake, text: "Do zamrożenia" },
  ].filter((item): item is { icon: typeof Clock; text: string } => Boolean(item));

  return (
    <Link
      href={`/meals/${meal.key}`}
      className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      <Card className="gap-3 transition-transform active:scale-[0.99]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{meal.category}</p>
            <h2 className="text-lg leading-tight font-bold">{meal.name}</h2>
          </div>
          <div className="flex shrink-0 gap-1">
            {meal.variants.map((variant) => (
              <VariantBadge key={variant.key} variant={variant.variant} />
            ))}
          </div>
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-extrabold">{Math.round(v.kcal)}</span>
          <span className="text-sm text-muted-foreground">kcal</span>
          <span className="ml-auto text-sm font-semibold text-muted-foreground">{macroSummary(v)}</span>
        </div>

        {meta.length > 0 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {meta.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-1">
                <Icon className="size-4" />
                {text}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </Link>
  );
}
