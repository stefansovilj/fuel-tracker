const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

/** Finds a non-trashed Google Sheet by exact name, so devices never need a copy-pasted spreadsheet ID. */
export async function findSpreadsheetByName(token: string, name: string): Promise<string | null> {
  const escapedName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = `name = '${escapedName}' and mimeType = '${SPREADSHEET_MIME}' and trashed = false`;
  const params = new URLSearchParams({ q, fields: 'files(id,name)', pageSize: '1' });

  const res = await fetch(`${DRIVE_FILES_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google Drive API error (${res.status}): ${body || res.statusText}`);
  }
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}
