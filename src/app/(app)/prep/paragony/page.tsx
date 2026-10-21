import Link from "next/link";
import { ChevronLeft, Lock } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { todayIso } from "@/lib/date";
import { listQueuedContributions, listReceipts, type StoredReceipt } from "@/lib/db/receipts";
import { getSettings } from "@/lib/db/settings";
import { deleteReceiptAction, exportContributionsAction, saveReceiptAction, setLineSharedAction } from "./actions";
import { ReceiptEditor } from "./receipt-editor";
import { ReceiptList } from "./receipt-list";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  const settings = await getSettings();
  let receipts: StoredReceipt[] = [];
  let queued = 0;
  let missingTables = false;
  try {
    [receipts, queued] = await Promise.all([listReceipts(), listQueuedContributions().then((list) => list.length)]);
  } catch (error) {
    console.error("[receipts] unavailable:", error);
    missingTables = true;
  }

  return (
    <>
      <Link
        href="/prep/zakupy"
        className="-ml-1 flex h-10 w-fit items-center gap-1 pr-2 font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-5" />
        Zakupy
      </Link>
      <PageHeader title="Paragony" subtitle="Ile naprawdę zapłaciłeś: Twoja historia cen" />
      <Card className="flex-row gap-3 p-4 text-sm">
        <Lock className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          Paragony są prywatne. Zdjęcie nie jest zapisywane. Tekst zapisujemy po usunięciu numeru karty, transakcji,
          telefonu i godziny. Ceny z paragonu są historią z tamtego dnia, nigdy „aktualną ceną” sklepu.
        </p>
      </Card>
      {missingTables ? (
        <p className="text-sm text-destructive">Brak tabel paragonów w bazie: zastosuj migrację 20261020120000_grocery_foundation.sql.</p>
      ) : (
        <>
          <ReceiptEditor city={settings.shopping_city} today={todayIso()} onSave={saveReceiptAction} />
          <ReceiptList
            receipts={receipts}
            queued={queued}
            onDelete={deleteReceiptAction}
            onShare={setLineSharedAction}
            onExport={exportContributionsAction}
          />
        </>
      )}
    </>
  );
}
