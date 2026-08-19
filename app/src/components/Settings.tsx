import { useState } from 'react';
import type { Vehicle } from '../lib/fuelCalc';

interface Props {
  vehicles: Vehicle[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (name: string) => Promise<void>;
}

export function Settings({ vehicles, selectedId, onSelect, onAdd }: Props) {
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

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

  return (
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
  );
}
