"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Friendly Polish fallback for an unexpected failure. The technical detail is
 * logged for the server/browser console; the screen never shows a stack trace.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app]", error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-4 py-10">
      <Card className="items-center gap-3 py-10 text-center">
        <h1 className="text-2xl font-extrabold">Coś poszło nie tak</h1>
        <p className="text-muted-foreground">
          Spróbuj jeszcze raz. Jeśli to się powtórzy, odśwież stronę za chwilę.
        </p>
        <Button size="lg" onClick={reset} className="mt-2">
          <RefreshCw />
          Spróbuj ponownie
        </Button>
      </Card>
    </main>
  );
}
