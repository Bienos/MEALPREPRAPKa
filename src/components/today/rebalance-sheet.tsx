"use client";

import { useTransition } from "react";
import { ArrowDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { Projection, Suggestion } from "@/lib/meals/rebalance";

function signed(value: number, unit: string): string {
  return `${value > 0 ? "+" : ""}${value} ${unit}`;
}

/** [ PRZELICZ RESZTĘ DNIA ]: what changed, and the smallest fix. */
export function RebalanceSheet({
  open,
  onClose,
  data,
  onAccept,
}: {
  open: boolean;
  onClose: () => void;
  /** null while the projection is still being computed. */
  data: { projection: Projection; suggestions: Suggestion[] } | null;
  onAccept: (suggestion: Suggestion) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();


  return (
    <Sheet open={open} onClose={onClose} title="Dzień się zmienił">
      {data === null ? (
        <p className="py-6 text-center text-muted-foreground">Liczę…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-muted/60 px-4 py-3">
            <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
              Prognoza dnia
            </p>
            <p className={cn("text-lg font-extrabold", data.projection.delta.kcal > 0 && "text-destructive")}>
              {signed(data.projection.delta.kcal, "kcal")}
            </p>
            <p className="text-sm text-muted-foreground">
              {signed(data.projection.delta.protein_g, "g białka")} ·{" "}
              {signed(data.projection.delta.fat_g, "g tłuszczu")} ·{" "}
              {signed(data.projection.delta.carbs_g, "g węgli")}
            </p>
          </div>

          {data.suggestions.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">
              Dzień jest wystarczająco blisko celu. Nic nie trzeba zmieniać.
            </p>
          ) : (
            <>
              <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                Proponowana zmiana
              </p>
              <ul className="flex flex-col gap-2">
                {data.suggestions.map((suggestion, index) => (
                  <li key={index} className="rounded-xl border bg-card p-4">
                    {suggestion.kind === "swap" ? (
                      <div className="flex flex-col gap-1">
                        <p className="text-sm text-muted-foreground">{suggestion.meal.slot}</p>
                        <p className="font-semibold">{suggestion.meal.mealName}</p>
                        <ArrowDown className="size-4 text-muted-foreground" />
                        <p className="font-bold">{suggestion.to.mealName}</p>
                      </div>
                    ) : (
                      <p className="font-bold">{suggestion.label}</p>
                    )}

                    <p className="mt-2 text-sm text-muted-foreground">
                      {signed(suggestion.difference.kcal, "kcal")} ·{" "}
                      {signed(suggestion.difference.fat_g, "g tłuszczu")} ·{" "}
                      {signed(suggestion.difference.protein_g, "g białka")}
                    </p>

                    {suggestion.kind === "block" ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Dodaj to do dnia, żeby dobić makro.
                      </p>
                    ) : (
                      <Button
                        className="mt-3 w-full"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await onAccept(suggestion);
                            onClose();
                          })
                        }
                      >
                        {pending ? "Zmieniam…" : "AKCEPTUJ ZMIANĘ"}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

