"use client";

import Link from "next/link";
import { PartyPopper, Refrigerator } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type CreatedPortion = { mealName: string; variant: "DT" | "DNT" | null; count: number };

export function PrepComplete({ portions }: { portions: CreatedPortion[] }) {
  const total = portions.reduce((sum, portion) => sum + portion.count, 0);

  return (
    <div className="flex flex-col gap-5">
      <Card className="items-center gap-3 border-accent/30 bg-accent/5 py-8 text-center">
        <PartyPopper className="size-10 text-accent" />
        <div>
          <h1 className="text-2xl font-extrabold">Prep gotowy</h1>
          <p className="text-muted-foreground">{total} porcji trafiło do lodówki</p>
        </div>
      </Card>

      <Card className="gap-0 p-0">
        <ul>
          {portions.map((portion, index) => (
            <li key={`${portion.mealName}-${index}`} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
              <span className="min-w-0 flex-1 font-semibold">
                {portion.mealName}
                {portion.variant ? ` ${portion.variant}` : ""}
              </span>
              <span className="shrink-0 font-bold">× {portion.count}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Outline, so the one primary button on this screen is the next prep. */}
      <Button size="lg" variant="outline" className="h-16 w-full text-xl" asChild>
        <Link href="/prep/lodowka">
          <Refrigerator className="size-6" />
          ZOBACZ LODÓWKĘ
        </Link>
      </Button>
    </div>
  );
}
