"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Refrigerator, Snowflake } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { expiryLabel, isUrgent, type FridgeGroup } from "@/lib/meals/prep-view-types";

/** Prepared portions only. One dot per portion, soonest expiry first. */
export function Fridge({
  groups,
  onFreeze,
}: {
  groups: FridgeGroup[];
  onFreeze: (portionId: string) => Promise<void>;
}) {
  const fridge = groups.filter((group) => group.location === "fridge");
  const freezer = groups.filter((group) => group.location === "freezer");
  const urgent = fridge.filter((group) => isUrgent(group.daysLeft));
  const urgentPortions = urgent.reduce((sum, group) => sum + group.portionIds.length, 0);

  if (groups.length === 0) {
    return (
      <Card className="items-center gap-3 py-10 text-center">
        <Refrigerator className="size-10 text-muted-foreground" />
        <p className="font-semibold">Nie masz jeszcze gotowych porcji.</p>
        <Button asChild size="lg">
          <Link href="/prep">PRZYGOTUJ NA 3 DNI</Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {urgentPortions > 0 ? (
        <p className="rounded-lg bg-primary/10 px-4 py-3 text-sm font-semibold">
          Zjedz dziś — {urgentPortions}{" "}
          {urgentPortions === 1 ? "porcja traci" : "porcje tracą"} świeżość jutro.
        </p>
      ) : null}

      {fridge.length > 0 ? (
        <Section title="Zjedz najpierw" groups={fridge} onFreeze={onFreeze} />
      ) : null}
      {freezer.length > 0 ? <Section title="Zamrażarka" groups={freezer} onFreeze={onFreeze} frozen /> : null}
    </div>
  );
}

function Section({
  title,
  groups,
  onFreeze,
  frozen = false,
}: {
  title: string;
  groups: FridgeGroup[];
  onFreeze: (portionId: string) => Promise<void>;
  frozen?: boolean;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">{title}</h2>
      <ul className="flex flex-col gap-3">
        {groups.map((group) => (
          <li key={`${group.mealName}-${group.variant}-${group.location}`}>
            <PortionCard group={group} onFreeze={onFreeze} frozen={frozen} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PortionCard({
  group,
  onFreeze,
  frozen,
}: {
  group: FridgeGroup;
  onFreeze: (portionId: string) => Promise<void>;
  frozen: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const count = group.portionIds.length;

  return (
    <Card className="gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg leading-tight font-bold">
            {group.mealName}
            {group.variant ? (
              <span className={cn("ml-2 text-sm font-bold", group.variant === "DT" ? "text-primary" : "text-accent")}>
                {group.variant}
              </span>
            ) : null}
          </h3>
          <p className={cn("text-sm", isUrgent(group.daysLeft) && !frozen ? "font-semibold text-primary" : "text-muted-foreground")}>
            {frozen ? "W zamrażarce" : expiryLabel(group.daysLeft)}
          </p>
        </div>
        <span className="shrink-0 text-lg font-extrabold">{count}</span>
      </div>

      <div className="flex items-center gap-1.5" aria-label={`${count} porcji`}>
        {group.portionIds.map((id) => (
          <span
            key={id}
            aria-hidden
            className={cn("size-3 rounded-full", frozen ? "bg-accent/60" : "bg-primary")}
          />
        ))}
      </div>

      {!frozen ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={pending}
          onClick={() => startTransition(async () => { await onFreeze(group.portionIds[0]); })}
        >
          <Snowflake className="size-4" />
          {pending ? "Mrożę…" : "Zamroź porcję"}
        </Button>
      ) : null}
    </Card>
  );
}
