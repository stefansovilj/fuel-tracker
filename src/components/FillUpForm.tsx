import { useState } from 'react';
import { fixed2, parseStoredDate } from '../lib/fuelCalc';

export interface DefaultPrice {
  value: number;
  /** e.g. "Nis Petrol · Evro Dizel · 04.09.2026" */
  label: string;
}

interface Props {
  vehicleId: string | null;
  defaultPrice: DefaultPrice | null;
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

export function FillUpForm({ vehicleId, defaultPrice, onSubmit }: Props) {
  const [date, setDate] = useState(todayDisplayDate());
  const [odometer, setOdometer] = useState('');
  const [liters, setLiters] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);
  const [saving, setSaving] = useState(false);
  // Both fields are prefilled/derived until the user takes them over; from then on their typing
  // wins, and clearing the field hands control back. Kept as "what the user typed" plus a flag,
  // and resolved during render, so a snapshot that arrives late (or a liters edit) updates the
  // shown value without an effect writing over state the user owns.
  const [priceInput, setPriceInput] = useState('');
  const [priceEdited, setPriceEdited] = useState(false);
  const [totalPriceInput, setTotalPriceInput] = useState('');
  const [totalPriceEdited, setTotalPriceEdited] = useState(false);

  const prefilledPrice = defaultPrice ? fixed2(defaultPrice.value) : '';
  const pricePerLiter = priceEdited ? priceInput : prefilledPrice;

  const computedTotal = Number(liters) * Number(pricePerLiter);
  const totalPrice = totalPriceEdited
    ? totalPriceInput
    : Number.isFinite(computedTotal) && computedTotal > 0
      ? fixed2(computedTotal)
      : '';

  function handlePriceChange(value: string) {
    setPriceEdited(value.trim().length > 0);
    setPriceInput(value);
  }

  function handleTotalPriceChange(value: string) {
    setTotalPriceEdited(value.trim().length > 0);
    setTotalPriceInput(value);
  }

  function handleRecalculate() {
    setTotalPriceInput('');
    setTotalPriceEdited(false);
  }

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
      // totalPrice stays the value that's actually stored: every derived column, here and after
      // a pull back from the Sheet, is recomputed from the raw ones — so a price per liter kept
      // alongside it would be the copy that drifts. It's an input aid, not a stored field.
      await onSubmit({
        date,
        odometer: Number(odometer),
        liters: Number(liters),
        totalPrice: Number(totalPrice),
        notes,
      });
      setOdometer('');
      setLiters('');
      setNotes('');
      // Both fields go back to following the snapshot for the next entry.
      setPriceInput('');
      setPriceEdited(false);
      setTotalPriceInput('');
      setTotalPriceEdited(false);
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

      <label htmlFor="pricePerLiter">Price per liter</label>
      <input
        id="pricePerLiter"
        type="number"
        step="0.01"
        placeholder="e.g. 234.00"
        value={pricePerLiter}
        onChange={(e) => handlePriceChange(e.target.value)}
      />
      <p className="field-hint">
        {defaultPrice
          ? defaultPrice.label
          : 'Pump price unavailable — enter the price per liter or the total yourself.'}
      </p>

      <label htmlFor="totalPrice">Total price paid</label>
      <input
        id="totalPrice"
        type="number"
        step="0.01"
        placeholder="e.g. 12690.00"
        value={totalPrice}
        onChange={(e) => handleTotalPriceChange(e.target.value)}
      />
      <p className="field-hint">
        {totalPriceEdited ? (
          <>
            Entered manually.{' '}
            <button type="button" className="link-button" onClick={handleRecalculate}>
              Recalculate
            </button>
          </>
        ) : (
          'Calculated as liters × price per liter. Type here to override.'
        )}
      </p>

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
