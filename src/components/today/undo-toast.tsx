"use client";

import { useEffect } from "react";
import { Plus, Undo2 } from "lucide-react";

/** Small toast after a change. Auto-dismisses; its one button reverts or follows up. */
export function UndoToast({
  message,
  actionLabel = "Cofnij",
  onAction,
  onDismiss,
  timeoutMs = 6000,
}: {
  message: string;
  actionLabel?: string;
  onAction: () => void;
  onDismiss: () => void;
  timeoutMs?: number;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, timeoutMs);
    return () => clearTimeout(timer);
  }, [onDismiss, timeoutMs, message]);

  const Icon = actionLabel === "Cofnij" ? Undo2 : Plus;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-4"
    >
      <div className="flex w-full max-w-md items-center gap-3 rounded-full bg-foreground px-5 py-3 text-background shadow-lg">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{message}</p>
        <button
          type="button"
          onClick={onAction}
          className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-sm font-bold text-background underline-offset-2 hover:underline"
        >
          <Icon className="size-4" />
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
