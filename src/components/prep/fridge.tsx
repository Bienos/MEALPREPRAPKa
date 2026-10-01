"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, ChefHat, Plus, Refrigerator, Snowflake, Trash2 } from "lucide-react";

import { MealImage } from "@/components/meals/meal-image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { expiryLabel, expiryTone, type ExpiryTone, type FridgeGroup } from "@/lib/meals/prep-view-types";

type Plan = (mealKey: string) => Promise<{ ok: boolean; message?: string }>;

const TONE: Record<ExpiryTone, string> = {
  urgent: "bg-destructive/12 text-destructive",
  soon: "bg-primary/15 text-primary",
  fresh: "bg-accent/15 text-accent",
  none: "bg-muted text-muted-foreground",
};

function count(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return "1 porcja";
  return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? `${n} porcje` : `${n} porcji`;
}

/**
 * What you cooked ahead and have left. Eating a meal on Today takes a portion
 * from here by itself; "Na dziś" is the shortcut that puts one on today's plan.
 */
export function Fridge({
  groups,
  onFreeze,
  onDiscard,
  onPlan,
}: {
  groups: FridgeGroup[];
  onFreeze: (portionId: string) => Promise<void>;
  onDiscard: (portionId: string) => Promise<void>;
  onPlan: Plan;
}) {
  const fridge = groups.filter((group) => group.location === "fridge");
  const freezer = groups.filter((group) => group.location === "freezer");
  const total = (list: FridgeGroup[]) => list.reduce((sum, group) => sum + group.portionIds.length, 0);
  const urgent = total(fridge.filter((group) => expiryTone(group.daysLeft) === "urgent"));

  if (groups.length === 0) {
    return (
      <Card className="items-center gap-3 py-10 text-center">
        <Refrigerator className="size-10 text-muted-foreground" />
        <div>
          <p className="font-semibold">Nic tu jeszcze nie ma</p>
          <p className="mx-auto max-w-xs text-sm text-muted-foreground">
            Gdy ugotujesz prep, porcje pojawią się tutaj razem z datą, do kiedy są dobre.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/prep">
            <ChefHat />
            Zaplanuj prep
          </Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Porcje, które ugotowałeś na zapas. Kiedy oznaczysz posiłek jako zjedzony, odejmuje się sama.
      </p>

      {urgent > 0 ? (
        <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {urgent === 1 ? "1 porcja jest" : `${urgent} porcje są`} na ostatnią chwilę. Zjedz {urgent === 1 ? "ją" : "je"} dziś.
        </p>
      ) : null}

      {fridge.length > 0 ? (
        <Section title="W lodówce" detail={count(total(fridge))} groups={fridge} {...{ onFreeze, onDiscard, onPlan }} />
      ) : null}
      {freezer.length > 0 ? (
        <Section title="W zamrażarce" detail={count(total(freezer))} groups={freezer} frozen {...{ onFreeze, onDiscard, onPlan }} />
      ) : null}
    </div>
  );
}

function Section({
  title,
  detail,
  groups,
  frozen = false,
  ...actions
}: {
  title: string;
  detail: string;
  groups: FridgeGroup[];
  frozen?: boolean;
  onFreeze: (portionId: string) => Promise<void>;
  onDiscard: (portionId: string) => Promise<void>;
  onPlan: Plan;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-baseline gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase">
        {title}
        <span className="font-semibold tracking-normal normal-case">{detail}</span>
      </h2>
      <ul className="flex flex-col gap-3">
        {groups.map((group) => (
          <li key={`${group.mealName}-${group.variant}-${group.location}`}>
            <PortionCard group={group} frozen={frozen} {...actions} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PortionCard({
  group,
  frozen,
  onFreeze,
  onDiscard,
  onPlan,
}: {
  group: FridgeGroup;
  frozen: boolean;
  onFreeze: (portionId: string) => Promise<void>;
  onDiscard: (portionId: string) => Promise<void>;
  onPlan: Plan;
}) {
  const [pending, startTransition] = useTransition();
  const [planned, setPlanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = group.portionIds.length;
  const tone = frozen ? "none" : expiryTone(group.daysLeft);

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center gap-3">
        <MealImage name={group.mealName} className="size-16 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg leading-tight font-bold">
            {group.mealName}
            {group.variant ? <span className="ml-2 text-sm font-bold text-muted-foreground">{group.variant}</span> : null}
          </h3>
          <span
            className={cn(
              "mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold",
              frozen ? "bg-muted text-foreground" : TONE[tone],
            )}
          >
            {frozen ? <Snowflake className="size-3" /> : null}
            {frozen ? "Zamrożone" : expiryLabel(group.daysLeft)}
          </span>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-3xl leading-none font-extrabold tabular-nums">{n}</p>
          <p className="text-xs font-semibold text-muted-foreground">{n === 1 ? "porcja" : "porcji"}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {group.mealKey ? (
          planned ? (
            <Button asChild variant="secondary" className="min-w-0 flex-1">
              <Link href="/">
                <Check />
                Dodane · zobacz dziś
              </Link>
            </Button>
          ) : (
            <Button
              className="min-w-0 flex-1"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await onPlan(group.mealKey!);
                  if (result.ok) setPlanned(true);
                  else setError(result.message ?? "Nie udało się dodać.");
                })
              }
            >
              <Plus strokeWidth={3} />
              Na dziś
            </Button>
          )
        ) : null}
        {!frozen ? (
          <Button
            variant="outline"
            size="sm"
            className="h-12 px-4"
            disabled={pending}
            onClick={() => startTransition(async () => { await onFreeze(group.portionIds[0]); })}
            aria-label={`Zamroź porcję: ${group.mealName}`}
          >
            <Snowflake />
            Zamroź
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="h-12 px-4 text-muted-foreground"
          disabled={pending}
          onClick={() => startTransition(async () => { await onDiscard(group.portionIds[0]); })}
          aria-label={`Wyrzuć porcję: ${group.mealName}`}
        >
          <Trash2 />
          Wyrzuć
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </Card>
  );
}
