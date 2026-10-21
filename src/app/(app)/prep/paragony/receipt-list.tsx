"use client";

import { ChevronDown, Download, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { formatGrosz } from "@/lib/grocery/money";
import { linePrice } from "@/lib/grocery/receipts";
import { retailerById } from "@/lib/grocery/retailers";
import type { StoredReceipt } from "@/lib/db/receipts";
import { cn } from "@/lib/utils";
import type { deleteReceiptAction, exportContributionsAction, setLineSharedAction } from "./actions";

/** "18.10" */
const day = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

export function ReceiptList({
  receipts,
  queued,
  onDelete,
  onShare,
  onExport,
}: {
  receipts: StoredReceipt[];
  queued: number;
  onDelete: typeof deleteReceiptAction;
  onShare: typeof setLineSharedAction;
  onExport: typeof exportContributionsAction;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [exported, setExported] = useState<number | null>(null);

  function exportQueue() {
    start(async () => {
      const { csv, count } = await onExport();
      setExported(count);
      if (count === 0) return;
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `ceny-do-udostepnienia-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-extrabold">Moje paragony</h2>
      {receipts.length === 0 ? <p className="text-sm text-muted-foreground">Jeszcze żadnego.</p> : null}
      <ul className="flex flex-col gap-2">
        {receipts.map((receipt) => {
          const expanded = open === receipt.id;
          const shop = receipt.retailer_id ? (retailerById(receipt.retailer_id)?.name ?? receipt.retailer_id) : "Sklep";
          return (
            <li key={receipt.id} className="rounded-xl border bg-card">
              <button type="button" onClick={() => setOpen(expanded ? null : receipt.id)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">
                    {shop}
                    {receipt.store_label ? `, ${receipt.store_label}` : ""}
                  </span>
                  <span className="block text-xs font-semibold text-muted-foreground">
                    {day(receipt.purchased_on)} · {receipt.lines.length} poz.{receipt.city ? ` · ${receipt.city}` : ""}
                  </span>
                </span>
                {receipt.total_grosz !== null ? <span className="font-extrabold tabular-nums">{formatGrosz(receipt.total_grosz)}</span> : null}
                <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
              </button>
              {expanded ? (
                <div className="flex flex-col gap-2 border-t px-4 py-3">
                  {receipt.lines.map((line) => {
                    const price = linePrice({ quantity: line.quantity, unit: line.unit, totalGrosz: line.total_grosz, discountGrosz: line.discount_grosz, deposit: line.deposit });
                    const shared = line.contribution?.status === "queued" || line.contribution?.status === "exported";
                    return (
                      <div key={line.id} className="flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold first-letter:uppercase">{line.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {String(line.quantity).replace(".", ",")} {line.unit}
                            {price ? ` · ${formatGrosz(price.amountGrosz)}${price.per === "kg" ? "/kg" : "/szt."}` : ""}
                            {line.discount_grosz > 0 ? ` · rabat −${formatGrosz(line.discount_grosz)}` : ""}
                            {line.contribution?.status === "exported" ? " · wyeksportowane" : ""}
                          </span>
                        </span>
                        {price ? (
                          <label className="flex shrink-0 items-center gap-1.5 text-xs font-semibold">
                            <input
                              type="checkbox"
                              checked={shared}
                              disabled={pending || line.contribution?.status === "exported"}
                              onChange={(event) => start(async () => onShare(line.id, event.target.checked))}
                              className="size-4"
                            />
                            udostępnij
                          </label>
                        ) : null}
                      </div>
                    );
                  })}
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-fit text-destructive"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm("Usunąć ten paragon razem z jego cenami?")) start(async () => onDelete(receipt.id));
                    }}
                  >
                    <Trash2 className="size-4" />
                    Usuń paragon i jego ceny
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
        <p className="font-semibold">Do udostępnienia: {queued}</p>
        <p className="text-xs text-muted-foreground">
          Tylko sieć, miasto, dzień, produkt i cena, bez adresu sklepu, godziny, sumy i reszty zakupów. Nic nie wysyłamy
          sami: pobierasz plik CSV i decydujesz, gdzie go wgrać (np. Open Prices, gdzie dane są publiczne na licencji
          ODbL).
        </p>
        <Button type="button" variant="outline" className="w-fit" disabled={pending || queued === 0} onClick={exportQueue}>
          <Download className="size-4" />
          Pobierz CSV
        </Button>
        {exported !== null ? <p className="text-xs text-muted-foreground">Wyeksportowano {exported}.</p> : null}
      </div>
    </section>
  );
}
