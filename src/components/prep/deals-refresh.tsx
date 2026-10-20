"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import type { RefreshFeedsResult, RefreshPromosResult, RefreshSweepResult } from "@/app/(app)/prep/zakupy/actions";
import { Button } from "@/components/ui/button";

/** Data older than this is refreshed when the screen opens. */
const STALE_HOURS = 12;

/**
 * "Dane z 20.10, 15:12" and a button to bring them up to date. When the data is
 * older than half a day it refreshes itself once when the screen opens, so what
 * is on it is what the shops show now (there is no background job).
 */
export function DealsRefresh({
  fetchedAt,
  fetchedLabel,
  onRefresh,
  onRefreshSweep,
  onRefreshFeeds,
}: {
  /** When the data was fetched (ISO), null when never. */
  fetchedAt: string | null;
  fetchedLabel: string | null;
  onRefresh: () => Promise<RefreshPromosResult>;
  onRefreshSweep: () => Promise<RefreshSweepResult>;
  onRefreshFeeds: () => Promise<RefreshFeedsResult>;
}) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(null);
  const autoStarted = useRef(false);

  function refresh() {
    setNote(null);
    start(async () => {
      const notes: string[] = [];
      const main = await onRefresh();
      if (!main.ok) {
        setNote({ error: true, text: main.message });
        return;
      }
      notes.push(...main.warnings);
      const sweep = await onRefreshSweep();
      if (!sweep.ok) notes.push(sweep.message);
      else if (!sweep.complete)
        notes.push(`Gazetki: przeczytano ${sweep.pagesRead} z ${sweep.pagesTotal} stron, odśwież jeszcze raz.`);
      const feeds = await onRefreshFeeds();
      if (!feeds.ok) notes.push(feeds.message);
      else notes.push(...feeds.notes);
      setNote(notes.length > 0 ? { error: false, text: notes.join(" ") } : null);
    });
  }

  useEffect(() => {
    const old = fetchedAt === null || Date.now() - Date.parse(fetchedAt) > STALE_HOURS * 3_600_000;
    if (old && !autoStarted.current) {
      autoStarted.current = true;
      refresh();
    }
    // Once, when the screen opens with old data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm">
          {pending ? (
            <span className="font-semibold">Pobieram świeże ceny ze sklepów… (do minuty)</span>
          ) : fetchedLabel ? (
            <>
              <span className="font-semibold">Dane z {fetchedLabel}</span>
            </>
          ) : (
            <span className="font-semibold">Brak pobranych cen</span>
          )}
        </p>
        <Button type="button" variant="outline" onClick={refresh} disabled={pending} className="h-11 shrink-0 gap-2">
          <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
          Odśwież
        </Button>
      </div>
      {note ? (
        <p className={note.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{note.text}</p>
      ) : null}
    </div>
  );
}
