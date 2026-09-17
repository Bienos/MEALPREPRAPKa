import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-4 py-10">
      <Card className="items-center gap-3 py-10 text-center">
        <h1 className="text-2xl font-extrabold">Nie ma takiej strony</h1>
        <p className="text-muted-foreground">Wróć do dzisiejszego planu.</p>
        <Button size="lg" asChild className="mt-2">
          <Link href="/">Dziś</Link>
        </Button>
      </Card>
    </main>
  );
}
