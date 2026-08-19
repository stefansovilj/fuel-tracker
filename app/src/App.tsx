import { useEffect, useState } from 'react';
import { addFillUp, addVehicle, getFillUps, getVehicles } from './db';
import { aggregateStats, type FillUp, type Vehicle } from './lib/fuelCalc';
import { exportFillUpsToExcel } from './lib/excelExport';
import { ensureAccessToken, disconnect as disconnectGoogle, isConnected as isGoogleConnected } from './lib/googleAuth';
import { syncActiveVehicle, pullVehicles } from './lib/sync';
import { extractSpreadsheetId } from './lib/googleSheetsSync';
import { Settings } from './components/Settings';
import { FillUpForm } from './components/FillUpForm';
import { History } from './components/History';
import { Dashboard } from './components/Dashboard';

type Page = 'form' | 'history' | 'dashboard' | 'settings';

const SELECTED_VEHICLE_KEY = 'fuel-tracker:selectedVehicleId';
const GOOGLE_CLIENT_ID_KEY = 'fuel-tracker:googleClientId';
const SYNC_SPREADSHEET_ID_KEY = 'fuel-tracker:syncSpreadsheetId';

export default function App() {
  const [page, setPage] = useState<Page>('form');
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

  useEffect(() => {
    getVehicles().then((list) => {
      setVehicles(list);
      const stillValid = list.some((v) => v.id === selectedVehicleId);
      if (!stillValid) {
        setSelectedVehicleId(list.length ? list[0].id : null);
      }
    });
  }, []);

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
  }

  function handleExport() {
    const vehicle = vehicles.find((v) => v.id === selectedVehicleId);
    if (!vehicle) return;
    exportFillUpsToExcel(vehicle, fillUps);
  }

  async function handleConnectGoogle() {
    await ensureAccessToken(googleClientId);
    setGoogleConnected(true);
  }

  function handleDisconnectGoogle() {
    disconnectGoogle();
    setGoogleConnected(false);
  }

  function handleSpreadsheetIdChange(value: string) {
    setSyncSpreadsheetId(value.trim() ? extractSpreadsheetId(value) : null);
  }

  async function handlePullVehicles() {
    if (!syncSpreadsheetId) throw new Error('Paste a Google Sheet ID first.');

    const pulled = await pullVehicles({
      clientId: googleClientId,
      spreadsheetId: syncSpreadsheetId,
      allVehicles: vehicles,
    });

    setGoogleConnected(true);
    setVehicles(pulled);
    if (pulled.length && !pulled.some((v) => v.id === selectedVehicleId)) {
      setSelectedVehicleId(pulled[0].id);
    }
  }

  async function handleSync(): Promise<{ spreadsheetUrl: string }> {
    const vehicle = vehicles.find((v) => v.id === selectedVehicleId);
    if (!vehicle) throw new Error('Select a vehicle first.');

    const result = await syncActiveVehicle({
      clientId: googleClientId,
      spreadsheetId: syncSpreadsheetId,
      vehicle,
      allVehicles: vehicles,
    });

    setGoogleConnected(true);
    setSyncSpreadsheetId(result.spreadsheetId);
    setVehicles(result.vehicles);
    setFillUps(result.fillUps);

    return { spreadsheetUrl: result.spreadsheetUrl };
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
          spreadsheetId={syncSpreadsheetId ?? ''}
          onSpreadsheetIdChange={handleSpreadsheetIdChange}
          onPullVehicles={handlePullVehicles}
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
    </div>
  );
}
