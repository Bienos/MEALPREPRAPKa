"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CookingStep } from "@/lib/meals/cooking-steps";

/** Keeps the screen awake while cooking. Silently does nothing where unsupported. */
function useWakeLock(active: boolean) {
  const sentinel = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };

    nav.wakeLock
      ?.request("screen")
      .then((lock) => {
        if (cancelled) void lock.release();
        else sentinel.current = lock;
      })
      .catch(() => {
        // Unsupported or refused (e.g. low battery). Cooking still works.
      });

    return () => {
      cancelled = true;
      void sentinel.current?.release().catch(() => {});
      sentinel.current = null;
    };
  }, [active]);
}

/** One big step at a time, one dominant button. */
export function CookingMode({
  steps,
  initialStep,
  onStepChange,
  onFinish,
}: {
  steps: CookingStep[];
  initialStep: number;
  onStepChange: (step: number) => Promise<void>;
  onFinish: () => Promise<void>;
}) {
  const [index, setIndex] = useState(Math.min(initialStep, Math.max(steps.length - 1, 0)));
  const [pending, startTransition] = useTransition();
  useWakeLock(true);

  if (steps.length === 0) return null;
  const step = steps[index];
  const isLast = index === steps.length - 1;

  function goTo(next: number) {
    setIndex(next);
    void onStepChange(next);
  }

  return (
    <div className="flex min-h-[70vh] flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => goTo(index - 1)}
          aria-label="Poprzedni krok"
          className="flex size-11 items-center justify-center rounded-full border bg-card disabled:opacity-40"
        >
          <ChevronLeft className="size-5" />
        </button>
        <p className="flex-1 text-center text-lg font-bold text-muted-foreground">
          {index + 1} / {steps.length}
        </p>
        <span className="size-11" aria-hidden />
      </div>

      <div
        role="progressbar"
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={steps.length}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${((index + 1) / steps.length) * 100}%` }}
        />
      </div>

      <Card className="flex-1 justify-center gap-4 p-6 text-center">
        <p className="text-xs font-bold tracking-widest text-primary uppercase">Krok {index + 1}</p>
        <h1 className="text-3xl leading-tight font-extrabold text-balance">{step.title}</h1>
        {step.detail ? <p className="text-xl text-muted-foreground text-balance">{step.detail}</p> : null}
      </Card>

      <Button
        size="lg"
        className="h-20 w-full text-2xl"
        disabled={pending}
        onClick={() => {
          if (!isLast) {
            goTo(index + 1);
            return;
          }
          startTransition(async () => { await onFinish(); });
        }}
      >
        <Check className="size-7" />
        {isLast ? (pending ? "Kończę…" : "GOTOWE") : "KROK ZROBIONY"}
      </Button>
    </div>
  );
}
