import { Calculator } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Macros } from "@/lib/meals/today-view-types";

function Bar({ value, target, className }: { value: number; target: number; className?: string }) {
  const percent = target > 0 ? Math.min(Math.max((value / target) * 100, 0), 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full transition-[width] duration-500", className)} style={{ width: `${percent}%` }} />
    </div>
  );
}

/**
 * Top of Today: calories left in large type, then protein, carbs and fat as
 * thin bars. Eaten food only, so it answers "how much can I still eat".
 */
export function DaySummary({
  target,
  eaten,
  onRebalance,
}: {
  target: Macros;
  eaten: Macros;
  onRebalance: () => void;
}) {
  const left = Math.round(target.kcal - eaten.kcal);
  const over = left < 0;
  const macros: [string, number, number, string][] = [
    ["Białko", eaten.protein_g, target.protein_g, "bg-accent"],
    ["Węgle", eaten.carbs_g, target.carbs_g, "bg-primary"],
    ["Tłuszcz", eaten.fat_g, target.fat_g, "bg-primary/60"],
  ];

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
          {over ? "Ponad plan" : "Zostało"}
        </span>
        <span className={cn("ml-auto text-3xl font-extrabold tabular-nums", over && "text-destructive")}>
          {Math.abs(left).toLocaleString("pl-PL")}
        </span>
        <span className="text-sm font-semibold text-muted-foreground tabular-nums">
          / {Math.round(target.kcal).toLocaleString("pl-PL")} kcal
        </span>
      </div>
      <Bar value={eaten.kcal} target={target.kcal} className={over ? "bg-destructive" : "bg-primary"} />

      <dl className="grid grid-cols-3 gap-3">
        {macros.map(([label, value, goal, color]) => (
          <div key={label} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-1 text-xs">
              <dt className="font-semibold text-muted-foreground">{label}</dt>
              <dd className="font-bold tabular-nums">
                {Math.round(value)}
                <span className="font-semibold text-muted-foreground">/{Math.round(goal)}</span>
              </dd>
            </div>
            <Bar value={value} target={goal} className={color} />
          </div>
        ))}
      </dl>

      <button
        type="button"
        onClick={onRebalance}
        className="-mb-1 flex items-center gap-1.5 self-start rounded-full py-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <Calculator className="size-4" />
        Przelicz resztę dnia
      </button>
    </Card>
  );
}
