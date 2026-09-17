import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Fridge } from "@/components/prep/fridge";
import { PageHeader } from "@/components/shell/page-header";
import { todayIso } from "@/lib/date";
import { listAvailablePortions } from "@/lib/db/prep";
import { getSettings } from "@/lib/db/settings";
import type { FridgeGroup } from "@/lib/meals/prep-view-types";
import { discardPortionAction, freezePortionAction } from "../actions";

export const dynamic = "force-dynamic";

function daysBetween(from: string, to: string): number {
  const start = Date.UTC(...(from.split("-").map(Number) as [number, number, number]));
  const end = Date.UTC(...(to.split("-").map(Number) as [number, number, number]));
  return Math.round((end - start) / 86_400_000);
}

export default async function FridgePage() {
  const [settings, portions] = await Promise.all([getSettings(), listAvailablePortions()]);
  const today = todayIso(settings.timezone);

  // One card per dish + variant + location, so portions of the same thing stack.
  const groups = new Map<string, FridgeGroup>();
  for (const portion of portions) {
    const key = `${portion.batch.meal_name}|${portion.batch.variant ?? ""}|${portion.location}`;
    const daysLeft = portion.expires_on ? daysBetween(today, portion.expires_on) : null;
    const existing = groups.get(key);
    if (existing) {
      existing.portionIds.push(portion.id);
      if (
        daysLeft !== null &&
        (existing.daysLeft === null || daysLeft < existing.daysLeft)
      ) {
        existing.daysLeft = daysLeft;
        existing.expiresOn = portion.expires_on;
      }
    } else {
      groups.set(key, {
        mealKey: portion.batch.meal_key,
        mealName: portion.batch.meal_name,
        variant: portion.batch.variant,
        location: portion.location,
        portionIds: [portion.id],
        expiresOn: portion.expires_on,
        daysLeft,
      });
    }
  }

  // Soonest expiry first; undated portions last.
  const sorted = [...groups.values()].sort((a, b) => {
    if (a.daysLeft === b.daysLeft) return a.mealName.localeCompare(b.mealName, "pl");
    if (a.daysLeft === null) return 1;
    if (b.daysLeft === null) return -1;
    return a.daysLeft - b.daysLeft;
  });

  return (
    <>
      <Link
        href="/prep"
        className="-ml-1 flex h-10 w-fit items-center gap-1 pr-2 font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-5" />
        Prep
      </Link>
      <PageHeader title="Lodówka" subtitle="Tylko gotowe porcje" />
      <Fridge groups={sorted} onFreeze={freezePortionAction} onDiscard={discardPortionAction} />
    </>
  );
}
