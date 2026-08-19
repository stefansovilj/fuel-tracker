import { useState } from 'react';
import { parseStoredDate } from '../lib/fuelCalc';

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

// A native <input type="date"> always displays using the device's locale (mm/dd/yyyy on some
// phones, dd/mm/yyyy or dd.mm.yyyy on others) — its .value is locale-independent, but what the
// user actually sees isn't, which is exactly the inconsistency we want to avoid. A plain masked
// text field guarantees the same dd.mm.yyyy display everywhere, at the cost of the native
// calendar picker widget.
function todayDisplayDate(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  let result = '';
  for (let i = 0; i < digits.length; i++) {
    if (i === 2 || i === 4) result += '.';
    result += digits[i];
  }
  return result;
}

function isValidDisplayDate(value: string): boolean {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // JS's Date constructor silently normalizes overflow (e.g. 31 Feb rolls into March) instead
  // of rejecting it — round-tripping and comparing catches that instead of just trusting it.
  const parsed = parseStoredDate(value);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

export function FillUpForm({ vehicleId, onSubmit }: Props) {
  const [date, setDate] = useState(todayDisplayDate());
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
    if (!isValidDisplayDate(date)) {
      setMessage({ text: 'Enter a valid date as dd.mm.yyyy.', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        date,
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
      <input
        id="date"
        type="text"
        inputMode="numeric"
        placeholder="dd.mm.yyyy"
        value={date}
        onChange={(e) => setDate(formatDateInput(e.target.value))}
      />

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
