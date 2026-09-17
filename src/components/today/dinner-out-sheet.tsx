"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import type { Suggestion } from "@/lib/meals/rebalance";

/** [ ZOSTAW KALORIE NA KOLACJĘ ]: reserve a budget, shrink what is planned. */
export function DinnerOutSheet({
  open,
  onClose,
  onPlan,
  onAccept,
}: {
  open: boolean;
  onClose: () => void;
  onPlan: (reserve: number, preserveProtein: boolean) => Promise<{ suggestions: Suggestion[]; freed: number; needed: number }>;
  onAccept: (suggestion: Suggestion) => Promise<void>;
}) {
  const [reserve, setReserve] = useState("900");
  const [preserveProtein, setPreserveProtein] = useState(true);
  const [result, setResult] = useState<{ suggestions: Suggestion[]; freed: number; needed: number } | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setResult(null);
    onClose();
  }

  return (
    <Sheet open={open} onClose={close} title="Zostaw kalorie na kolację">
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Rezerwuję kalorie</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={reserve}
            onChange={(event) => setReserve(event.target.value)}
          />
        </label>

        <button
          type="button"
          onClick={() => setPreserveProtein((value) => !value)}
          aria-pressed={preserveProtein}
          className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 text-left"
        >
          <span
            aria-hidden
            className={`flex size-6 shrink-0 items-center justify-center rounded-md border-2 ${
              preserveProtein ? "border-accent bg-accent text-accent-foreground" : "border-border"
            }`}
          >
            {preserveProtein ? "✓" : ""}
          </span>
          <span className="flex-1 font-semibold">Zachowaj cel białka</span>
        </button>

        {result === null ? (
          <Button
            size="lg"
            disabled={pending || Number(reserve) <= 0}
            onClick={() =>
              startTransition(async () => {
                setResult(await onPlan(Number(reserve), preserveProtein));
              })
            }
          >
            {pending ? "Liczę…" : "POKAŻ ZMIANY"}
          </Button>
        ) : result.needed <= 0 ? (
          <p className="py-4 text-center text-muted-foreground">
            Masz już dość miejsca w dniu. Nic nie trzeba zmieniać.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Trzeba zwolnić {result.needed} kcal. Te zmiany zwalniają {result.freed} kcal.
            </p>
            <ul className="flex flex-col gap-2">
              {result.suggestions.map((suggestion, index) => (
                <li key={index} className="rounded-xl border bg-card p-4">
                  <p className="font-bold">{suggestion.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {suggestion.difference.kcal} kcal · {suggestion.difference.protein_g} g białka
                  </p>
                  <Button
                    className="mt-3 w-full"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await onAccept(suggestion);
                        close();
                      })
                    }
                  >
                    {pending ? "Zmieniam…" : "AKCEPTUJ ZMIANĘ"}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Sheet>
  );
}
