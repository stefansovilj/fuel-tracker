import { useState } from 'react';
import type { Vehicle } from '../lib/fuelCalc';
import { spreadsheetUrl } from '../lib/googleSheetsSync';

// The Google sign-in popup needs to message back to its opener and close itself — installed/
// standalone PWAs don't all handle that popup relationship correctly (seen getting stranded on
// a blank accounts.google.com page on Firefox for Android), even though the exact same flow
// works fine from a regular browser tab of the same site.
function isStandaloneDisplay(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;
}

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
  spreadsheetId: string | null;
  onSync: () => Promise<{ spreadsheetUrl: string }>;
  eurRate: string;
  onEurRateChange: (value: string) => void;
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
  spreadsheetId,
  onSync,
  eurRate,
  onEurRateChange,
}: Props) {
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

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

  async function handleSyncNow() {
    setSyncing(true);
    setSyncError(null);
    try {
      await onSync();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
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
          <>
            {isStandaloneDisplay() && (
              <p className="empty-hint">
                You're using the installed app — on some browsers (seen on Firefox for Android),
                Google sign-in can get stuck on a blank page here. If Connect doesn't work, open
                this same page in a regular browser tab, connect there once, then come back —
                the connection carries over.
              </p>
            )}
            <button type="button" disabled={connecting || !googleClientId.trim()} onClick={handleConnect}>
              {connecting ? 'Connecting…' : 'Connect Google Account'}
            </button>
          </>
        )}
        {connectError && <div className="message error">{connectError}</div>}

        <p className="empty-hint">
          On a new device, just paste the same Client ID and connect — the app finds your existing
          "Fuel Tracker Sync" spreadsheet by name automatically, no ID to copy.
        </p>

        <button
          type="button"
          className="secondary"
          disabled={syncing || !googleClientId.trim()}
          onClick={handleSyncNow}
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
        {syncError && <div className="message error">{syncError}</div>}

        {spreadsheetId && (
          <p className="empty-hint">
            <a href={spreadsheetUrl(spreadsheetId)} target="_blank" rel="noreferrer">
              Open synced spreadsheet
            </a>
          </p>
        )}
      </div>

      <div className="card">
        <h2>Currency</h2>
        <label htmlFor="eurRate">DIN → EUR rate (e.g. 117.5)</label>
        <input
          id="eurRate"
          type="number"
          step="0.01"
          placeholder="Leave blank to hide EUR figures"
          value={eurRate}
          onChange={(e) => onEurRateChange(e.target.value)}
        />
        <p className="empty-hint">
          Set this to show EUR alongside DIN on the Dashboard. Update it yourself whenever you
          want a fresher rate — the app doesn't fetch one automatically.
        </p>
      </div>
    </>
  );
}
