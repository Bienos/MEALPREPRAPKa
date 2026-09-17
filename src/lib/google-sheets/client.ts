import "server-only";

import { getServiceAccountEnv, getSheetsEnv, hasServiceAccountEnv } from "@/lib/env";
import { getAccessToken } from "./auth";
import { parseCsv } from "./csv";

const API = "https://sheets.googleapis.com/v4/spreadsheets";

async function sheetsGet<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`${API}/${path}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store", // caching happens one level up, in the meal library
  });
  if (!response.ok) {
    throw new Error(`Sheets API ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

/** Resolves the tab title for a gid from spreadsheet metadata, so tab renames do not break us. */
async function resolveSheetTitle(spreadsheetId: string, gid: number): Promise<string> {
  const data = await sheetsGet<{ sheets?: { properties?: { sheetId?: number; title?: string } }[] }>(
    `${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
  );
  const title = data.sheets?.find((sheet) => sheet.properties?.sheetId === gid)?.properties?.title;
  if (!title) {
    const available = data.sheets?.map((s) => `${s.properties?.title} (gid ${s.properties?.sheetId})`).join(", ");
    throw new Error(`No tab with gid ${gid} in spreadsheet ${spreadsheetId}. Available: ${available ?? "none"}`);
  }
  return title;
}

/** All rows of one tab as strings, via the authenticated Sheets API. */
async function readRowsAuthenticated(spreadsheetId: string, title: string): Promise<string[][]> {
  const range = encodeURIComponent(`'${title.replace(/'/g, "''")}'`);
  const data = await sheetsGet<{ values?: unknown[][] }>(
    `${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`,
  );
  return (data.values ?? []).map((row) => row.map((cell) => (cell == null ? "" : String(cell))));
}

/**
 * All rows of one tab via the public CSV export, no credentials required.
 * Works only when the spreadsheet is shared as "Anyone with the link — Viewer"
 * (or fully public). If it is not, Google returns an HTML sign-in page instead
 * of CSV, which is detected and reported clearly rather than mis-parsed.
 */
async function readRowsPublic(spreadsheetId: string, gid: number): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();
  const looksLikeHtml = /^\s*<(!doctype|html)/i.test(text);
  // A sign-in page means sharing; a 400 means Google accepted the request but
  // not the ids, so pointing at sharing would send you the wrong way.
  if (looksLikeHtml || response.status === 401 || response.status === 403) {
    throw new Error(
      `Nie udało się pobrać arkusza bez logowania (status ${response.status}). ` +
        `Upewnij się, że arkusz jest udostępniony jako „Każda osoba mająca link — Przeglądający”.`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `Google odrzucił żądanie arkusza (status ${response.status}). ` +
        `Sprawdź GOOGLE_SHEETS_SPREADSHEET_ID oraz GOOGLE_SHEETS_TARGET_GID (zakładka gid ${gid}).`,
    );
  }
  return parseCsv(text);
}

/**
 * The configured meal-library tab: its rows, and its display title when known.
 *
 * Uses the authenticated Sheets API when a service account is configured
 * (also resolving the tab's real name from the gid), otherwise falls back to
 * the public CSV export, which needs no credentials but cannot report a title.
 */
export async function fetchMealSheet(): Promise<{ title: string | null; rows: string[][] }> {
  const { GOOGLE_SHEETS_SPREADSHEET_ID: id, GOOGLE_SHEETS_TARGET_GID: gid } = getSheetsEnv();

  if (hasServiceAccountEnv()) {
    getServiceAccountEnv(); // validates early, before the network round-trip
    const title = await resolveSheetTitle(id, gid);
    return { title, rows: await readRowsAuthenticated(id, title) };
  }

  return { title: null, rows: await readRowsPublic(id, gid) };
}
