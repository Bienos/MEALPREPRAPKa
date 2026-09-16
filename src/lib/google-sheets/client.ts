import "server-only";

import { getGoogleEnv } from "@/lib/env";
import { getAccessToken } from "./auth";

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
export async function resolveSheetTitle(gid: number): Promise<string> {
  const { GOOGLE_SHEETS_SPREADSHEET_ID: id } = getGoogleEnv();
  const data = await sheetsGet<{ sheets?: { properties?: { sheetId?: number; title?: string } }[] }>(
    `${id}?fields=sheets(properties(sheetId,title))`,
  );
  const title = data.sheets?.find((sheet) => sheet.properties?.sheetId === gid)?.properties?.title;
  if (!title) {
    const available = data.sheets?.map((s) => `${s.properties?.title} (gid ${s.properties?.sheetId})`).join(", ");
    throw new Error(`No tab with gid ${gid} in spreadsheet ${id}. Available: ${available ?? "none"}`);
  }
  return title;
}

/** All rows of one tab as strings. Empty trailing cells are omitted by the API. */
export async function readSheetRows(title: string): Promise<string[][]> {
  const { GOOGLE_SHEETS_SPREADSHEET_ID: id } = getGoogleEnv();
  const range = encodeURIComponent(`'${title.replace(/'/g, "''")}'`);
  const data = await sheetsGet<{ values?: unknown[][] }>(
    `${id}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`,
  );
  return (data.values ?? []).map((row) => row.map((cell) => (cell == null ? "" : String(cell))));
}

/** The configured meal-library tab: its resolved title and raw rows. */
export async function fetchMealSheet(): Promise<{ title: string; rows: string[][] }> {
  const title = await resolveSheetTitle(getGoogleEnv().GOOGLE_SHEETS_TARGET_GID);
  return { title, rows: await readSheetRows(title) };
}
