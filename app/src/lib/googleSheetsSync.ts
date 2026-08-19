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

export async function createSpreadsheet(token: string, title: string): Promise<string> {
  const data = await sheetsFetch(token, '', {
    method: 'POST',
    body: JSON.stringify({ properties: { title } }),
  });
  return data.spreadsheetId as string;
}

export async function getTabNames(token: string, spreadsheetId: string): Promise<string[]> {
  const data = await sheetsFetch(token, `/${spreadsheetId}?fields=sheets.properties.title`);
  return (data.sheets ?? []).map((s: { properties: { title: string } }) => s.properties.title);
}

export async function ensureTab(token: string, spreadsheetId: string, tabName: string): Promise<void> {
  const tabs = await getTabNames(token, spreadsheetId);
  if (tabs.includes(tabName)) return;
  await sheetsFetch(token, `/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tabName } } }] }),
  });
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

export async function appendRows(
  token: string,
  spreadsheetId: string,
  tabName: string,
  rows: unknown[][]
): Promise<void> {
  if (!rows.length) return;
  const range = encodeURIComponent(quoteRange(tabName));
  await sheetsFetch(
    token,
    `/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: rows }) }
  );
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
