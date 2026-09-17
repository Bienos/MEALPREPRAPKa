"use client";

import { useTransition } from "react";

import { Sheet } from "@/components/ui/sheet";
import type { NoCookOption } from "@/lib/meals/recommend";

const KIND_LABEL: Record<NoCookOption["kind"], string> = {
  ready: "GOTOWE",
  fastest: "NAJSZYBSZE",
  buy: "KUP",
};

/** [ NIE CHCE MI SIĘ GOTOWAĆ ]: three ways out, no cooking required. */
export function NoCookSheet({
  open,
  onClose,
  data,
  onUse,
}: {
  open: boolean;
  onClose: () => void;
  /** null while the options are still being computed. */
  data: { remaining: { kcal: number; protein_g: number; fat_g: number; carbs_g: number }; options: NoCookOption[] } | null;
  onUse: (option: NoCookOption) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();


  return (
    <Sheet open={open} onClose={onClose} title="Nie chce mi się gotować">
      {data === null ? (
        <p className="py-6 text-center text-muted-foreground">Liczę…</p>
      ) : (
        <>
          <div className="mb-4 rounded-xl bg-muted/60 px-4 py-3">
            <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Zostało</p>
            <p className="text-lg font-extrabold">
              {Math.max(Math.round(data.remaining.kcal), 0)} kcal
              <span className="ml-2 text-sm font-semibold text-muted-foreground">
                {Math.max(Math.round(data.remaining.protein_g), 0)} B ·{" "}
                {Math.max(Math.round(data.remaining.fat_g), 0)} T ·{" "}
                {Math.max(Math.round(data.remaining.carbs_g), 0)} W
              </span>
            </p>
          </div>

          {data.options.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">
              Brak dań awaryjnych w arkuszu.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.options.map((option) => (
                <li key={`${option.kind}-${option.mealKey}`}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => startTransition(async () => { await onUse(option); onClose(); })}
                    className="flex w-full min-h-20 items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left hover:bg-muted disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold tracking-widest text-primary uppercase">
                        {KIND_LABEL[option.kind]}
                      </span>
                      <span className="block truncate font-bold">{option.mealName}</span>
                      <span className="block text-sm text-muted-foreground">
                        {option.prepTime ? `${option.prepTime} · ` : ""}
                        {Math.round(option.kcal)} kcal · {Math.round(option.protein_g)} B
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
                      Użyj
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Sheet>
  );
}

