import { useState } from 'react';
import type { Vehicle } from '../lib/fuelCalc';

interface Props {
  vehicles: Vehicle[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (name: string) => Promise<void>;
  googleClientId: string;
  onGoogleClientIdChange: (id: string) => void;
  isGoogleConnected: boolean;
  onConnectGoogle: () => Promise<void>;
  onDisconnectGoogle: () => void;
  spreadsheetUrl: string | null;
}

export function Settings({
  vehicles,
  selectedId,
  onSelect,
  onAdd,
  googleClientId,
  onGoogleClientIdChange,
  isGoogleConnected,
  onConnectGoogle,
  onDisconnectGoogle,
  spreadsheetUrl,
}: Props) {
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await onAdd(newName.trim());
      setNewName('');
    } finally {
      setAdding(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    try {
      await onConnectGoogle();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2>Active vehicle</h2>
        <label htmlFor="vehicle">Fill-ups and stats are shown for this vehicle</label>
        <select id="vehicle" value={selectedId ?? ''} onChange={(e) => onSelect(e.target.value)}>
          {vehicles.length === 0 && <option value="">No vehicles yet</option>}
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>

        <label htmlFor="newVehicleName">Add a vehicle</label>
        <input
          id="newVehicleName"
          type="text"
          placeholder="e.g. Skoda Octavia"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="button" className="secondary" disabled={adding} onClick={handleAdd}>
          Add vehicle
        </button>
      </div>

      <div className="card">
        <h2>Google Sheets sync</h2>
        <label htmlFor="googleClientId">Google OAuth Client ID</label>
        <input
          id="googleClientId"
          type="text"
          placeholder="xxxxxxxxxxxx.apps.googleusercontent.com"
          value={googleClientId}
          onChange={(e) => onGoogleClientIdChange(e.target.value)}
        />

        {isGoogleConnected ? (
          <>
            <p className="empty-hint">Connected.</p>
            <button type="button" className="secondary" onClick={onDisconnectGoogle}>
              Disconnect
            </button>
          </>
        ) : (
          <button type="button" disabled={connecting || !googleClientId.trim()} onClick={handleConnect}>
            {connecting ? 'Connecting…' : 'Connect Google Account'}
          </button>
        )}

        {connectError && <div className="message error">{connectError}</div>}

        {spreadsheetUrl && (
          <p className="empty-hint">
            Synced spreadsheet:{' '}
            <a href={spreadsheetUrl} target="_blank" rel="noreferrer">
              open in Google Sheets
            </a>
          </p>
        )}
      </div>
    </>
  );
}
