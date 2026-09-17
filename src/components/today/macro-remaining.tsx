import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Macros } from "@/lib/meals/today-view-types";

/** Compact "what is left today". Deliberately no charts. */
export function MacroRemaining({ remaining }: { remaining: Macros }) {
  const macros: [string, number, string][] = [
    ["Białko", remaining.protein_g, "B"],
    ["Tłuszcz", remaining.fat_g, "T"],
    ["Węgle", remaining.carbs_g, "W"],
  ];
  const over = remaining.kcal < 0;

  return (
    <Card className="gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
          {over ? "Ponad plan" : "Zostało dzisiaj"}
        </p>
        <p className={cn("text-2xl font-extrabold", over && "text-destructive")}>
          {Math.abs(Math.round(remaining.kcal))}
          <span className="ml-1 text-sm font-semibold text-muted-foreground">kcal</span>
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {macros.map(([label, value, short]) => (
          <div key={label} className="rounded-lg bg-muted/60 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className={cn("text-lg font-bold", value < 0 && "text-destructive")}>
              {Math.round(value)}
              <span className="ml-0.5 text-xs font-semibold text-muted-foreground">{short}</span>
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
