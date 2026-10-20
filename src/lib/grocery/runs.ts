import "server-only";

import { finishSyncRun, startSyncRun, type SyncRunPatch } from "@/lib/db/grocery";
import type { ProviderId } from "./providers";

/**
 * Runs one read of a source and records it in grocery_sync_runs (what came
 * in, what was kept, the error), so the sources screen shows every
 * provider's health. Bookkeeping never breaks the read: if the run cannot be
 * recorded (the grocery migration not applied yet), the read still happens.
 */
export async function recordRun<T>(
  providerId: ProviderId,
  work: () => Promise<T>,
  summarize: (result: T) => SyncRunPatch,
): Promise<T> {
  let runId: number | null = null;
  try {
    runId = await startSyncRun(providerId);
  } catch (error) {
    console.error(`[grocery] could not record a run of ${providerId}:`, error);
  }
  try {
    const result = await work();
    if (runId !== null) {
      await finishSyncRun(runId, providerId, summarize(result)).catch((error) =>
        console.error(`[grocery] could not finish the run of ${providerId}:`, error),
      );
    }
    return result;
  } catch (error) {
    if (runId !== null) {
      const message = error instanceof Error ? error.message : String(error);
      await finishSyncRun(runId, providerId, { status: "failed", error: message }).catch((failure) =>
        console.error(`[grocery] could not finish the run of ${providerId}:`, failure),
      );
    }
    throw error;
  }
}
