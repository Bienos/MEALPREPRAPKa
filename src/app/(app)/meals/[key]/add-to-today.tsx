"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { addToTodayAction } from "../../actions";

/** Plans one portion of this dish for today, in today's DT/DNT variant. */
export function AddToToday({ mealKey }: { mealKey: string }) {
  const [state, setState] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (state?.ok) {
    return (
      <Button asChild size="lg" variant="secondary" className="flex-1">
        <Link href="/">
          <Check />
          Dodane · pokaż dziś
        </Link>
      </Button>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-1">
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() => startTransition(async () => setState(await addToTodayAction(mealKey)))}
      >
        <Plus strokeWidth={3} />
        Dodaj do dziś
      </Button>
      {state?.message ? <p className="text-sm text-destructive">{state.message}</p> : null}
    </div>
  );
}
