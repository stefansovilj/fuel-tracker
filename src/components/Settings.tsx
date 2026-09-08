import { useState } from 'react';
import type { Vehicle } from '../lib/fuelCalc';
import { spreadsheetUrl } from '../lib/googleSheetsSync';
import { formatPricedAt, type FuelPriceSnapshot } from '../lib/fuelPrices';

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
  fuelPrices: FuelPriceSnapshot | null;
  fuelPricesFromCache: boolean;
  priceStationId: number;
  priceFuelId: number;
  onPriceSourceChange: (stationId: number, fuelId: number) => void;
  onRefreshPrices: () => Promise<void>;
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
  fuelPrices,
  fuelPricesFromCache,
  priceStationId,
  priceFuelId,
  onPriceSourceChange,
  onRefreshPrices,
}: Props) {
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const priceStation = fuelPrices?.stations.find((s) => s.id === priceStationId) ?? null;

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

  async function handleRefreshPrices() {
    setRefreshing(true);
    try {
      await onRefreshPrices();
    } finally {
      setRefreshing(false);
    }
  }

  // Switching station keeps the same grade where that station sells it, and otherwise falls back
  // to its basic diesel — the chains use different fuel ids for their own premium grades, so
  // carrying the old id over blindly would silently land on an unrelated fuel.
  function handleStationChange(stationId: number) {
    const station = fuelPrices?.stations.find((s) => s.id === stationId);
    if (!station || station.fuels.length === 0) return;
    const sameFuel = station.fuels.find((f) => f.id === priceFuelId);
    const diesel = station.fuels.find((f) => f.category === 'DIZEL');
    onPriceSourceChange(stationId, (sameFuel ?? diesel ?? station.fuels[0]).id);
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
        <h2>Default fuel price</h2>
        {fuelPrices ? (
          <>
            <label htmlFor="priceStation">Station</label>
            <select
              id="priceStation"
              value={priceStationId}
              onChange={(e) => handleStationChange(Number(e.target.value))}
            >
              {fuelPrices.stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>

            <label htmlFor="priceFuel">Fuel</label>
            <select
              id="priceFuel"
              value={priceFuelId}
              onChange={(e) => onPriceSourceChange(priceStationId, Number(e.target.value))}
            >
              {(priceStation?.fuels ?? []).map((fuel) => (
                <option key={fuel.id} value={fuel.id}>
                  {fuel.displayName} — {fuel.price.toFixed(2)} {fuelPrices.currency}
                </option>
              ))}
            </select>

            <p className="empty-hint">
              Prefills the price per liter on the Add form, where it can always be overridden.
              Prices last checked {formatPricedAt(fuelPrices.fetchedAt) ?? 'recently'}
              {fuelPricesFromCache ? ' (offline copy)' : ''}.
            </p>
          </>
        ) : (
          <p className="empty-hint">
            Pump prices are not available on this device yet — the Add form falls back to manual
            entry until they load.
          </p>
        )}
        <button
          type="button"
          className="secondary"
          disabled={refreshing}
          onClick={handleRefreshPrices}
        >
          {refreshing ? 'Refreshing…' : 'Refresh prices'}
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
