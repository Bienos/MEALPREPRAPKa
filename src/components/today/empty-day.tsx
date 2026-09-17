"use client";

import Link from "next/link";
import { useTransition } from "react";
import { CalendarPlus, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DayType } from "@/lib/meals/today-view-types";

/** Nothing planned yet: either fill the day in one tap, or set a default first. */
export function EmptyDay({
  dayType,
  hasTemplate,
  onUseDefault,
  error,
}: {
  dayType: DayType;
  hasTemplate: boolean;
  onUseDefault: () => Promise<void>;
  error: string | null;
}) {
  const [pending, startTransition] = useTransition();

  if (!hasTemplate) {
    return (
      <Card className="gap-4 border-primary/20 bg-gradient-to-br from-card to-primary/5 p-6 text-center">
        <CardHeader className="items-center">
          <Settings2 className="size-9 text-primary" />
          <CardTitle className="mt-2">Zacznij od domyślnego dnia</CardTitle>
          <CardDescription>
            Ustaw swój domyślny dzień, żeby planować jedzenie jednym kliknięciem.
          </CardDescription>
        </CardHeader>
        <Button size="lg" className="w-full" asChild>
          <Link href={`/dzien-domyslny?typ=${dayType}`}>Ustaw domyślny {dayType}</Link>
        </Button>
      </Card>
    );
  }

  return (
    <Card className="gap-4 border-primary/25 bg-gradient-to-br from-card to-primary/5 p-6 text-center">
      <CardHeader className="items-center">
        <CalendarPlus className="size-9 text-primary" />
        <CardTitle className="mt-2">Nie masz jeszcze planu na dziś</CardTitle>
        <CardDescription>Wstaw swój domyślny dzień {dayType} jednym kliknięciem.</CardDescription>
      </CardHeader>
      <Button
        size="lg"
        className="h-16 w-full text-xl"
        disabled={pending}
        onClick={() => startTransition(async () => { await onUseDefault(); })}
      >
        {pending ? "Tworzę plan…" : `UŻYJ DOMYŚLNEGO ${dayType}`}
      </Button>
      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
      <Link href={`/dzien-domyslny?typ=${dayType}`} className="text-sm font-semibold text-muted-foreground underline-offset-2 hover:underline">
        Zmień domyślny dzień
      </Link>
    </Card>
  );
}
