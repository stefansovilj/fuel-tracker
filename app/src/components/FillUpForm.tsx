import { useState } from 'react';
import { isoToDisplayDate } from '../lib/fuelCalc';

interface Props {
  vehicleId: string | null;
  onSubmit: (data: {
    date: string;
    odometer: number;
    liters: number;
    totalPrice: number;
    notes: string;
  }) => Promise<void>;
}

// The native <input type="date"> element always uses yyyy-mm-dd for its own value, regardless
// of how it's displayed — we convert to our stored dd.mm.yyyy format only at submit time.
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function FillUpForm({ vehicleId, onSubmit }: Props) {
  const [date, setDate] = useState(todayIso());
  const [odometer, setOdometer] = useState('');
  const [liters, setLiters] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!vehicleId) {
      setMessage({ text: 'Add or select a vehicle first.', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        date: isoToDisplayDate(date),
        odometer: Number(odometer),
        liters: Number(liters),
        totalPrice: Number(totalPrice),
        notes,
      });
      setOdometer('');
      setLiters('');
      setTotalPrice('');
      setNotes('');
      setMessage({ text: 'Saved.', type: 'success' });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err), type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <label htmlFor="date">Date</label>
      <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

      <label htmlFor="odometer">Odometer (total km)</label>
      <input
        id="odometer"
        type="number"
        step="0.01"
        placeholder="e.g. 199789"
        value={odometer}
        onChange={(e) => setOdometer(e.target.value)}
      />

      <label htmlFor="liters">Liters added</label>
      <input
        id="liters"
        type="number"
        step="0.01"
        placeholder="e.g. 63.80"
        value={liters}
        onChange={(e) => setLiters(e.target.value)}
      />

      <label htmlFor="totalPrice">Total price paid</label>
      <input
        id="totalPrice"
        type="number"
        step="0.01"
        placeholder="e.g. 12690.00"
        value={totalPrice}
        onChange={(e) => setTotalPrice(e.target.value)}
      />

      <label htmlFor="notes">Notes (optional)</label>
      <input
        id="notes"
        type="text"
        placeholder="e.g. full tank, highway"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <button type="button" disabled={saving} onClick={handleSubmit}>
        Save fill-up
      </button>

      {message && <div className={`message ${message.type}`}>{message.text}</div>}
    </div>
  );
}
