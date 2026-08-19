import { useEffect, useState } from 'react';
import { addFillUp, addVehicle, getFillUps, getVehicles } from './db';
import { aggregateStats, type FillUp, type Vehicle } from './lib/fuelCalc';
import { exportFillUpsToExcel } from './lib/excelExport';
import { ensureAccessToken, disconnect as disconnectGoogle, isConnected as isGoogleConnected } from './lib/googleAuth';
import { sync } from './lib/sync';
import { Settings } from './components/Settings';
import { FillUpForm } from './components/FillUpForm';
import { History } from './components/History';
import { Dashboard } from './components/Dashboard';
import { Toast } from './components/Toast';

type Page = 'form' | 'history' | 'dashboard' | 'settings';
type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

const PAGE_KEY = 'fuel-tracker:page';
const SELECTED_VEHICLE_KEY = 'fuel-tracker:selectedVehicleId';
const GOOGLE_CLIENT_ID_KEY = 'fuel-tracker:googleClientId';
const SYNC_SPREADSHEET_ID_KEY = 'fuel-tracker:syncSpreadsheetId';

const VALID_PAGES: Page[] = ['form', 'history', 'dashboard', 'settings'];

export default function App() {
  const [page, setPage] = useState<Page>(() => {
    const stored = localStorage.getItem(PAGE_KEY);
    return VALID_PAGES.includes(stored as Page) ? (stored as Page) : 'form';
  });
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    () => localStorage.getItem(SELECTED_VEHICLE_KEY)
  );
  const [fillUps, setFillUps] = useState<FillUp[]>([]);
  const [googleClientId, setGoogleClientId] = useState(
    () => localStorage.getItem(GOOGLE_CLIENT_ID_KEY) ?? ''
  );
  const [syncSpreadsheetId, setSyncSpreadsheetId] = useState<string | null>(
    () => localStorage.getItem(SYNC_SPREADSHEET_ID_KEY)
  );
  const [googleConnected, setGoogleConnected] = useState(() => isGoogleConnected());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [toastVisible, setToastVisible] = useState(false);

  // "syncing" pops up immediately and stays until superseded; "synced"/"error" then auto-dismiss
  // (error stays up longer, since a failure matters more than a routine success).
  useEffect(() => {
    if (syncStatus === 'idle') return;
    setToastVisible(true);
    if (syncStatus === 'syncing') return;
    const delay = syncStatus === 'error' ? 5000 : 2500;
    const timer = setTimeout(() => setToastVisible(false), delay);
    return () => clearTimeout(timer);
  }, [syncStatus]);

  function canAutoSync(): boolean {
    // No spreadsheetId requirement here — sync() discovers/creates one automatically, and
    // that doesn't need a popup, just an already-valid connection.
    return Boolean(googleClientId.trim()) && isGoogleConnected();
  }

  async function runSync(allVehicles: Vehicle[]) {
    const result = await sync({
      clientId: googleClientId,
      spreadsheetId: syncSpreadsheetId,
      activeVehicleId: selectedVehicleId,
      allVehicles,
    });
    setGoogleConnected(true);
    setSyncSpreadsheetId(result.spreadsheetId);
    setVehicles(result.vehicles);
    if (result.activeVehicleId && result.activeVehicleId !== selectedVehicleId) {
      setSelectedVehicleId(result.activeVehicleId);
    }
    setFillUps(result.fillUps);
    return result;
  }

  async function runAutoSync(allVehicles: Vehicle[]) {
    if (!canAutoSync()) return;
    setSyncStatus('syncing');
    try {
      await runSync(allVehicles);
      setSyncStatus('synced');
    } catch {
      setSyncStatus('error');
    }
  }

  // On load: if we're still within the persisted token's lifetime, sync automatically — this
  // also discovers the spreadsheet by name and pulls a vehicle list on a brand-new device with
  // nothing local yet. It can never pop up a fresh sign-in (browsers only allow that from a
  // direct click), so it just quietly does nothing once the token's expired until reconnected.
  useEffect(() => {
    getVehicles().then((list) => {
      setVehicles(list);
      const stillValid = list.some((v) => v.id === selectedVehicleId);
      if (!stillValid) {
        setSelectedVehicleId(list.length ? list[0].id : null);
      }
      void runAutoSync(list);
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(PAGE_KEY, page);
  }, [page]);

  useEffect(() => {
    if (selectedVehicleId) {
      localStorage.setItem(SELECTED_VEHICLE_KEY, selectedVehicleId);
    } else {
      localStorage.removeItem(SELECTED_VEHICLE_KEY);
    }

    if (!selectedVehicleId) {
      setFillUps([]);
      return;
    }
    getFillUps(selectedVehicleId).then(setFillUps);
  }, [selectedVehicleId]);

  useEffect(() => {
    localStorage.setItem(GOOGLE_CLIENT_ID_KEY, googleClientId);
  }, [googleClientId]);

  useEffect(() => {
    if (syncSpreadsheetId) {
      localStorage.setItem(SYNC_SPREADSHEET_ID_KEY, syncSpreadsheetId);
    } else {
      localStorage.removeItem(SYNC_SPREADSHEET_ID_KEY);
    }
  }, [syncSpreadsheetId]);

  async function handleAddVehicle(name: string) {
    const vehicle = await addVehicle(name);
    setVehicles(await getVehicles());
    setSelectedVehicleId(vehicle.id);
  }

  async function handleAddFillUp(data: {
    date: string;
    odometer: number;
    liters: number;
    totalPrice: number;
    notes: string;
  }) {
    if (!selectedVehicleId) throw new Error('Select a vehicle first.');
    await addFillUp({ vehicleId: selectedVehicleId, ...data });
    setFillUps(await getFillUps(selectedVehicleId));
    void runAutoSync(vehicles);
  }

  function handleExport() {
    const vehicle = vehicles.find((v) => v.id === selectedVehicleId);
    if (!vehicle) return;
    exportFillUpsToExcel(vehicle, fillUps);
  }

  async function handleConnectGoogle() {
    await ensureAccessToken(googleClientId);
    setGoogleConnected(true);
    void runAutoSync(vehicles);
  }

  function handleDisconnectGoogle() {
    disconnectGoogle();
    setGoogleConnected(false);
  }

  async function handleSync(): Promise<{ spreadsheetUrl: string }> {
    setSyncStatus('syncing');
    try {
      const result = await runSync(vehicles);
      setSyncStatus('synced');
      return { spreadsheetUrl: result.spreadsheetUrl };
    } catch (err) {
      setSyncStatus('error');
      throw err;
    }
  }

  const stats = aggregateStats(fillUps);
  const activeVehicle = vehicles.find((v) => v.id === selectedVehicleId) ?? null;

  function renderPage() {
    if (page === 'settings') {
      return (
        <Settings
          vehicles={vehicles}
          selectedId={selectedVehicleId}
          onSelect={setSelectedVehicleId}
          onAdd={handleAddVehicle}
          googleClientId={googleClientId}
          onGoogleClientIdChange={setGoogleClientId}
          isGoogleConnected={googleConnected}
          onConnectGoogle={handleConnectGoogle}
          onDisconnectGoogle={handleDisconnectGoogle}
          spreadsheetId={syncSpreadsheetId}
          onSync={handleSync}
        />
      );
    }

    if (!activeVehicle) {
      return (
        <div className="card">
          <p className="empty-hint">
            No vehicle selected yet. Go to Settings to add a vehicle before logging fill-ups.
          </p>
          <button type="button" onClick={() => setPage('settings')}>
            Open Settings
          </button>
        </div>
      );
    }

    if (page === 'form') return <FillUpForm vehicleId={selectedVehicleId} onSubmit={handleAddFillUp} />;
    if (page === 'history') {
      return <History fillUps={fillUps} onSync={handleSync} syncEnabled={googleClientId.trim().length > 0} />;
    }
    return <Dashboard stats={stats} onExport={handleExport} />;
  }

  return (
    <div className="app">
      <h1>Fuel Tracker{activeVehicle ? ` — ${activeVehicle.name}` : ''}</h1>
      {googleClientId.trim() && (
        <p className={`sync-status ${googleConnected ? 'connected' : ''}`}>
          {googleConnected ? 'Connected' : 'Not connected'}
        </p>
      )}
      <nav>
        <a className={page === 'form' ? 'active' : ''} onClick={() => setPage('form')}>
          Add
        </a>
        <a className={page === 'history' ? 'active' : ''} onClick={() => setPage('history')}>
          History
        </a>
        <a className={page === 'dashboard' ? 'active' : ''} onClick={() => setPage('dashboard')}>
          Dashboard
        </a>
        <a className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}>
          Settings
        </a>
      </nav>

      {renderPage()}

      {toastVisible && (
        <Toast
          type={syncStatus === 'error' ? 'error' : syncStatus === 'synced' ? 'success' : 'info'}
          message={
            syncStatus === 'syncing'
              ? 'Syncing with Google Sheets…'
              : syncStatus === 'synced'
                ? 'Synced with Google Sheets'
                : 'Sync failed — open History or Settings to retry'
          }
          onDismiss={() => setToastVisible(false)}
        />
      )}
    </div>
  );
}
