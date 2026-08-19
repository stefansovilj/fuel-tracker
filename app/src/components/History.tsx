import { useState } from 'react';
import { parseStoredDate, type FillUp } from '../lib/fuelCalc';

interface Props {
  fillUps: FillUp[];
  onSync: () => Promise<{ spreadsheetUrl: string }>;
  syncEnabled: boolean;
}

export function History({ fillUps, onSync, syncEnabled }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncedUrl, setSyncedUrl] = useState<string | null>(null);

  const rows = [...fillUps].sort(
    (a, b) => parseStoredDate(b.date).getTime() - parseStoredDate(a.date).getTime()
  );

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setSyncedUrl(null);
    try {
      const result = await onSync();
      setSyncedUrl(result.spreadsheetUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="card">
      <h2>Fill-up history</h2>
      {rows.length === 0 ? (
        <p className="empty-hint">No fill-ups logged yet.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Odometer</th>
                <th>Liters</th>
                <th>Distance</th>
                <th>L/100km</th>
                <th>Total price</th>
                <th>Price/L</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id}>
                  <td>{f.date}</td>
                  <td>{f.odometer.toLocaleString()}</td>
                  <td>{f.liters}</td>
                  <td>{f.distance ?? '—'}</td>
                  <td>{f.consumption ?? '—'}</td>
                  <td>{f.totalPrice.toLocaleString()}</td>
                  <td>{f.pricePerLiter}</td>
                  <td>{f.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button type="button" className="secondary" disabled={syncing || !syncEnabled} onClick={handleSync}>
        {syncing ? 'Syncing…' : 'Sync to Google Sheets'}
      </button>
      {!syncEnabled && (
        <p className="empty-hint">Set a Google OAuth Client ID in Settings to enable sync.</p>
      )}
      {error && <div className="message error">{error}</div>}
      {syncedUrl && (
        <div className="message success">
          Synced.{' '}
          <a href={syncedUrl} target="_blank" rel="noreferrer">
            Open spreadsheet
          </a>
        </div>
      )}
    </div>
  );
}
