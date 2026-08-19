import { disconnect } from './googleAuth';

const API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

async function sheetsFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    // A dead/revoked token would otherwise fail the same way forever — clear it so the next
    // sync attempt (auto or manual) correctly shows "not connected" instead of silently erroring.
    if (res.status === 401) disconnect();
    const body = await res.text().catch(() => '');
    throw new Error(`Google Sheets API error (${res.status}): ${body || res.statusText}`);
  }
  return res.json();
}

export function sanitizeTabName(name: string): string {
  return (name.trim() || 'Sheet').slice(0, 100);
}

function quoteRange(tabName: string): string {
  return `'${tabName.replace(/'/g, "''")}'`;
}

/** Builds a fully-qualified A1 range like `'Tab Name'!D5` for use with the values:batchUpdate endpoint. */
export function buildRange(tabName: string, a1: string): string {
  return `${quoteRange(tabName)}!${a1}`;
}

function parseStartRow(updatedRange: string): number | null {
  const rangePart = updatedRange.slice(updatedRange.lastIndexOf('!') + 1);
  const match = rangePart.match(/^[A-Z]+(\d+)/);
  return match ? Number(match[1]) : null;
}

export async function createSpreadsheet(
  token: string,
  title: string,
  firstTabTitle: string
): Promise<string> {
  // Naming the first sheet ourselves avoids Google's default, unused "Sheet1" tab.
  const data = await sheetsFetch(token, '', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: firstTabTitle } }],
    }),
  });
  return data.spreadsheetId as string;
}

export interface TabMeta {
  title: string;
  sheetId: number;
}

export async function getTabs(token: string, spreadsheetId: string): Promise<TabMeta[]> {
  const data = await sheetsFetch(
    token,
    `/${spreadsheetId}?fields=sheets.properties.title,sheets.properties.sheetId`
  );
  return (data.sheets ?? []).map((s: { properties: { title: string; sheetId: number } }) => ({
    title: s.properties.title,
    sheetId: s.properties.sheetId,
  }));
}

export async function getTabNames(token: string, spreadsheetId: string): Promise<string[]> {
  return (await getTabs(token, spreadsheetId)).map((t) => t.title);
}

export async function ensureTab(token: string, spreadsheetId: string, tabName: string): Promise<void> {
  const tabs = await getTabNames(token, spreadsheetId);
  if (tabs.includes(tabName)) return;
  await sheetsFetch(token, `/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tabName } } }] }),
  });
}

/** Applies a number format (e.g. "0.00") to whole columns, so values always display with that
 * many decimal places — a display-only change, it never touches the underlying cell values, so
 * it's safe to (re-)apply to already-written rows too. */
export async function setColumnNumberFormat(
  token: string,
  spreadsheetId: string,
  sheetId: number,
  columnIndexes: number[],
  pattern: string
): Promise<void> {
  const requests = columnIndexes.map((columnIndex) => ({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: 1,
        startColumnIndex: columnIndex,
        endColumnIndex: columnIndex + 1,
      },
      cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern } } },
      fields: 'userEnteredFormat.numberFormat',
    },
  }));
  await sheetsFetch(token, `/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  });
}

export async function deleteTab(token: string, spreadsheetId: string, sheetId: number): Promise<void> {
  await sheetsFetch(token, `/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: [{ deleteSheet: { sheetId } }] }),
  });
}

/** Removes Google's default "Sheet1" tab if it's still present and untouched — safe as long as at least one other tab already exists. */
export async function removeDefaultSheetIfEmpty(token: string, spreadsheetId: string): Promise<void> {
  const tabs = await getTabs(token, spreadsheetId);
  if (tabs.length < 2) return;
  const defaultTab = tabs.find((t) => t.title === 'Sheet1');
  if (!defaultTab) return;
  const rows = await readTab(token, spreadsheetId, 'Sheet1');
  if (rows.length === 0) {
    await deleteTab(token, spreadsheetId, defaultTab.sheetId);
  }
}

export async function readTab(
  token: string,
  spreadsheetId: string,
  tabName: string
): Promise<Array<Array<string | number | boolean>>> {
  const range = encodeURIComponent(quoteRange(tabName));
  const data = await sheetsFetch(
    token,
    `/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`
  );
  return data.values ?? [];
}

/** Appends rows as literal values (never interpreted as formulas/dates) and returns the row
 * number the block started at, so formula cells for those same rows can be filled in afterward. */
export async function appendRows(
  token: string,
  spreadsheetId: string,
  tabName: string,
  rows: unknown[][]
): Promise<number | null> {
  if (!rows.length) return null;
  const range = encodeURIComponent(quoteRange(tabName));
  const data = await sheetsFetch(
    token,
    `/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: rows }) }
  );
  const updatedRange = data.updates?.updatedRange as string | undefined;
  return updatedRange ? parseStartRow(updatedRange) : null;
}

/** Writes formulas (or any values) into specific ranges, interpreted the way typing them into
 * the UI would be — used only for the derived columns, never for raw data, so a plain-text date
 * like "2026-07-09" elsewhere in the row is never at risk of being reinterpreted as a real date. */
export async function batchUpdateValues(
  token: string,
  spreadsheetId: string,
  data: Array<{ range: string; values: unknown[][] }>
): Promise<void> {
  if (!data.length) return;
  await sheetsFetch(token, `/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  });
}

export function spreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

/** Accepts either a bare spreadsheet ID or a full Google Sheets URL and returns the bare ID. */
export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
}
