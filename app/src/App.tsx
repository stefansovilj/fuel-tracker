import { useEffect, useState } from 'react';
import { addFillUp, addVehicle, getFillUps, getVehicles } from './db';
import { aggregateStats, type FillUp, type Vehicle } from './lib/fuelCalc';
import { exportFillUpsToExcel } from './lib/excelExport';
import { VehicleSelector } from './components/VehicleSelector';
import { FillUpForm } from './components/FillUpForm';
import { Dashboard } from './components/Dashboard';

type Page = 'form' | 'dashboard';

export default function App() {
  const [page, setPage] = useState<Page>('form');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [fillUps, setFillUps] = useState<FillUp[]>([]);

  useEffect(() => {
    getVehicles().then((list) => {
      setVehicles(list);
      if (list.length && !selectedVehicleId) setSelectedVehicleId(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedVehicleId) {
      setFillUps([]);
      return;
    }
    getFillUps(selectedVehicleId).then(setFillUps);
  }, [selectedVehicleId]);

  async function handleAddVehicle(name: string) {
    const vehicle = await addVehicle(name);
    const list = await getVehicles();
    setVehicles(list);
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

  const stats = aggregateStats(fillUps);

  return (
    <div className="app">
      <h1>Fuel Tracker</h1>
      <nav>
        <a className={page === 'form' ? 'active' : ''} onClick={() => setPage('form')}>
          Add fill-up
        </a>
        <a className={page === 'dashboard' ? 'active' : ''} onClick={() => setPage('dashboard')}>
          Dashboard
        </a>
      </nav>

      <VehicleSelector
        vehicles={vehicles}
        selectedId={selectedVehicleId}
        onSelect={setSelectedVehicleId}
        onAdd={handleAddVehicle}
      />

      {page === 'form' ? (
        <FillUpForm vehicleId={selectedVehicleId} onSubmit={handleAddFillUp} />
      ) : (
        <Dashboard stats={stats} onExport={handleExport} />
      )}
    </div>
  );
}
