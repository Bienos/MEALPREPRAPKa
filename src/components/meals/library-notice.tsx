import { AlertTriangle, FlaskConical } from "lucide-react";

import type { MealLibrarySnapshot } from "@/lib/meals/types";

/** Explains where the data came from when it is not simply fresh from the sheet. */
export function LibraryNotice({ snapshot }: { snapshot: MealLibrarySnapshot }) {
  const { source, error, library } = snapshot;
  return (
    <>
      {source === "stale" ? (
        <Notice icon={AlertTriangle} tone="warn" title="Google Sheets chwilowo niedostępne" detail={error}>
          Pokazuję ostatnią pobraną wersję biblioteki.
        </Notice>
      ) : null}
      {source === "fixture" ? (
        <Notice icon={FlaskConical} tone="muted" title="Dane testowe" detail={error}>
          Brak konfiguracji Google, więc widzisz mały zestaw przykładowych posiłków (tylko w trybie deweloperskim).
        </Notice>
      ) : null}
      {library.issues.length > 0 ? (
        <details className="rounded-lg border bg-card px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold">
            Pominięto {library.issues.length} {library.issues.length === 1 ? "wiersz" : "wiersze"} z arkusza
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
            {library.issues.map((issue) => (
              <li key={`${issue.row}-${issue.problems[0]}`}>
                Wiersz {issue.row}
                {issue.name ? ` („${issue.name}”)` : ""}: {issue.problems.join("; ")}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

function Notice({
  icon: Icon,
  tone,
  title,
  detail,
  children,
}: {
  icon: typeof AlertTriangle;
  tone: "warn" | "muted";
  title: string;
  detail: string | null;
  children: React.ReactNode;
}) {
  const toneClass = tone === "warn" ? "border-primary/30 bg-primary/5" : "border-border bg-muted/60";
  return (
    <div className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${toneClass}`}>
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="text-muted-foreground">{children}</p>
        {detail ? (
          <details className="mt-1 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Szczegóły</summary>
            <p className="mt-1 break-words">{detail}</p>
          </details>
        ) : null}
      </div>
    </div>
  );
}
