"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Mobile bottom sheet. Uses a native <dialog> so Escape, focus trapping and
 * the top layer come for free, styled to slide up from the bottom.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        // Clicking the backdrop (the dialog itself, not its content) closes.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "m-0 mt-auto w-full max-w-md bg-transparent p-0 backdrop:bg-foreground/40",
        "sm:mx-auto",
      )}
    >
      <div
        className={cn(
          "flex max-h-[85vh] flex-col gap-4 rounded-t-3xl bg-background px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]",
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <span aria-hidden className="mx-auto h-1.5 w-12 rounded-full bg-border" />
        </div>
        <div className="flex items-center gap-3">
          <h2 className="min-w-0 flex-1 text-xl font-extrabold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-card"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-1">{children}</div>
      </div>
    </dialog>
  );
}
