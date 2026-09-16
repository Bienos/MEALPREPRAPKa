import { Check, Clock } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

// Rendered per request so the date is never frozen at build time.
export const dynamic = "force-dynamic";

function todayLabel() {
  return new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
}

export default function TodayPage() {
  return (
    <>
      <PageHeader title="Dziś" subtitle={todayLabel()} />

      <Card className="gap-6 border-primary/20 bg-gradient-to-br from-card to-primary/5 p-6">
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-primary">
            <Clock className="size-4" />
            Następny posiłek
          </CardDescription>
          <CardTitle className="text-2xl">Brak zaplanowanego posiłku</CardTitle>
          <CardDescription>Plan dnia pojawi się tutaj po wdrożeniu planowania.</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button size="lg" className="w-full" disabled>
            <Check />
            Zjedzone
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Później</CardTitle>
          <CardDescription>Kolejne posiłki i pozostałe makro będą widoczne w tym miejscu.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Jeszcze nic do pokazania.</CardContent>
      </Card>
    </>
  );
}
