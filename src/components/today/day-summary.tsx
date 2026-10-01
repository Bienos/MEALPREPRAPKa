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

export type SummaryKind = "left" | "eaten" | "planned";

const LABEL: Record<SummaryKind, string> = { left: "Zostało", eaten: "Zjedzone", planned: "Zaplanowano" };

/**
 * Top of a day: calories in large type, then protein, carbs and fat as thin
 * bars. Today answers "how much can I still eat"; a past day shows what was
 * eaten and a future day what is planned.
 */
export function DaySummary({
  target,
  eaten,
  kind,
  onRebalance,
}: {
  target: Macros;
  /** Eaten food for today and past days, everything planned for a future day. */
  eaten: Macros;
  kind: SummaryKind;
  onRebalance?: () => void;
}) {
  const left = Math.round(target.kcal - eaten.kcal);
  const over = left < 0;
  const shown = kind === "left" ? Math.abs(left) : Math.round(eaten.kcal);
  const macros: [string, number, number, string][] = [
    ["Białko", eaten.protein_g, target.protein_g, "bg-accent"],
    ["Węgle", eaten.carbs_g, target.carbs_g, "bg-primary"],
    ["Tłuszcz", eaten.fat_g, target.fat_g, "bg-primary/60"],
  ];

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
          {kind === "left" && over ? "Ponad plan" : LABEL[kind]}
        </span>
        <span className={cn("ml-auto text-3xl font-extrabold tabular-nums", kind === "left" && over && "text-destructive")}>
          {shown.toLocaleString("pl-PL")}
        </span>
        <span className="text-sm font-semibold text-muted-foreground tabular-nums">
          / {Math.round(target.kcal).toLocaleString("pl-PL")} kcal
        </span>
      </div>
      <Bar value={eaten.kcal} target={target.kcal} className={over && kind !== "eaten" ? "bg-destructive" : "bg-primary"} />

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

      {onRebalance ? (
        <button
          type="button"
          onClick={onRebalance}
          className="-mb-1 flex items-center gap-1.5 self-start rounded-full py-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <Calculator className="size-4" />
          {kind === "left" ? "Przelicz resztę dnia" : "Sprawdź, czy się zgadza"}
        </button>
      ) : null}
    </Card>
  );
}
