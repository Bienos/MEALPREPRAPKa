import "server-only";

import { getSheetsEnv } from "@/lib/env";
import { columnLetter, type CellWrite } from "@/lib/meals/sheet-edit";
import { WRITE_SCOPE, getAccessToken } from "./auth";
import { readRowsAuthenticated, resolveSheetTitle } from "./client";

const API = "https://sheets.googleapis.com/v4/spreadsheets";

async function sheetsPost(path: string, body: unknown): Promise<void> {
  const token = await getAccessToken(WRITE_SCOPE);
  const response = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (response.status === 403) {
    throw new Error(
      "Google nie pozwala zapisać arkusza. Udostępnij arkusz kontu serwisowemu jako Edytor (patrz DEPLOY.md).",
    );
  }
  if (!response.ok) throw new Error(`Sheets API ${response.status}: ${await response.text()}`);
}

function quote(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/** The meal tab as it is right now: its title and every row, read fresh. */
export async function readMealTabFresh(): Promise<{ title: string; rows: string[][] }> {
  const { GOOGLE_SHEETS_SPREADSHEET_ID: id, GOOGLE_SHEETS_TARGET_GID: gid } = getSheetsEnv();
  const title = await resolveSheetTitle(id, gid);
  return { title, rows: await readRowsAuthenticated(id, title) };
}

/**
 * Sets exactly these cells and nothing else, in one request. RAW input, so
 * text that starts with "=" is stored as text and never becomes a formula.
 */
export async function writeCells(title: string, writes: CellWrite[]): Promise<void> {
  if (writes.length === 0) return;
  const { GOOGLE_SHEETS_SPREADSHEET_ID: id } = getSheetsEnv();
  await sheetsPost(`${id}/values:batchUpdate`, {
    valueInputOption: "RAW",
    data: writes.map((write) => ({
      range: `${quote(title)}!${columnLetter(write.col)}${write.row}`,
      values: [[write.value]],
    })),
  });
}

/**
 * Adds one row right under the last filled row. Google looks for the table
 * starting at that row, so an empty row higher up cannot pull the new meal
 * into the middle of the sheet. INSERT_ROWS shifts nothing that exists.
 */
export async function appendRow(title: string, afterRow: number, row: (string | number)[]): Promise<void> {
  const { GOOGLE_SHEETS_SPREADSHEET_ID: id } = getSheetsEnv();
  const range = encodeURIComponent(`${quote(title)}!A${Math.max(afterRow, 1)}`);
  await sheetsPost(`${id}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    values: [row],
  });
}
