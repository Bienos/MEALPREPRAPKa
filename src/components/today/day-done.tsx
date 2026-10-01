import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Macros } from "@/lib/meals/today-view-types";

/** How the day went, in a sentence, using only the numbers on screen. */
function verdict(eaten: Macros, target: Macros): string {
  const kcal = eaten.kcal / target.kcal;
  const protein = eaten.protein_g / target.protein_g;
  if (kcal > 1.08) return `Wyszło o ${Math.round(eaten.kcal - target.kcal)} kcal ponad plan.`;
  if (kcal < 0.88) return `Zostało ${Math.round(target.kcal - eaten.kcal)} kcal. Możesz coś dodać.`;
  return protein >= 0.92 ? "Trafiony dzień." : "Kalorie się zgadzają, białka trochę brakuje.";
}

/** Everything eaten: the day in numbers, and the way into tomorrow. */
export function DayDone({
  eaten,
  target,
  tomorrowDate,
  tomorrowPlanned,
}: {
  eaten: Macros;
  target: Macros;
  tomorrowDate: string;
  tomorrowPlanned: boolean;
}) {
  return (
    <Card className="gap-4 border-accent/30 bg-accent/5 p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Check className="size-6" strokeWidth={3} />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold">Dzień zamknięty</h2>
          <p className="text-sm text-muted-foreground">{verdict(eaten, target)}</p>
        </div>
      </div>
      <Button size="lg" asChild>
        <Link href={`/dzien/${tomorrowDate}`}>
          {tomorrowPlanned ? "Zobacz jutro" : "Zaplanuj jutro"}
          <ArrowRight />
        </Link>
      </Button>
    </Card>
  );
}
