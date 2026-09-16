"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { syncMeals, type SyncState } from "./actions";

const initial: SyncState = { status: "idle", message: "" };

/**
 * Renders as `display: contents` so the parent grid places the button beside
 * the page title and the status message on its own full-width row below.
 */
export function SyncButton() {
  const [state, action, pending] = useActionState<SyncState, FormData>(() => syncMeals(), initial);

  return (
    <form action={action} className="contents">
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={pending}
        aria-label="Synchronizuj posiłki z Google Sheets"
        className="justify-self-end"
      >
        <RefreshCw className={cn("size-4", pending && "animate-spin")} />
        {pending ? "Synchronizuję…" : "Synchronizuj"}
      </Button>
      {state.status !== "idle" ? (
        <p
          role="status"
          className={cn(
            "col-span-2 text-sm break-words",
            state.status === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
