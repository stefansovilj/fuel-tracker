import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { computeFillUp, type FillUp, type FillUpInput, type Vehicle } from './lib/fuelCalc';

interface FuelTrackerDB extends DBSchema {
  vehicles: {
    key: string;
    value: Vehicle;
  };
  fillups: {
    key: number;
    value: FillUp;
    indexes: { vehicleId: string };
  };
}

let dbPromise: Promise<IDBPDatabase<FuelTrackerDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<FuelTrackerDB>('fuel-tracker', 1, {
      upgrade(db) {
        db.createObjectStore('vehicles', { keyPath: 'id' });
        const fillups = db.createObjectStore('fillups', { keyPath: 'id', autoIncrement: true });
        fillups.createIndex('vehicleId', 'vehicleId');
      },
    });
  }
  return dbPromise;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function getVehicles(): Promise<Vehicle[]> {
  const db = await getDb();
  return db.getAll('vehicles');
}

export async function addVehicle(name: string): Promise<Vehicle> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Vehicle name is required.');

  const db = await getDb();
  const existing = await db.getAll('vehicles');
  const ids = new Set(existing.map((v) => v.id));
  const base = slugify(trimmed) || 'vehicle';
  let id = base;
  let suffix = 1;
  while (ids.has(id)) {
    id = `${base}-${++suffix}`;
  }

  // synced: false marks this as created via the explicit "Add vehicle" action and not yet
  // pushed — the only thing that makes a vehicle eligible to be pushed to Sheets.
  const vehicle: Vehicle = { id, name: trimmed, synced: false };
  await db.put('vehicles', vehicle);
  return vehicle;
}

// Deliberately not sorted by parsing the date string — insertion order (IndexedDB's natural
// order for a non-unique index falls back to primary key / insertion order) is already
// chronological, since replaceFillUpsForVehicle inserts in the Sheet's own row order and
// addFillUp only ever appends a new-enough entry after validation.
export async function getFillUps(vehicleId: string): Promise<FillUp[]> {
  const db = await getDb();
  return db.getAllFromIndex('fillups', 'vehicleId', vehicleId);
}

export async function addFillUp(input: FillUpInput): Promise<FillUp> {
  const priorRows = await getFillUps(input.vehicleId);
  const previous = priorRows.length ? priorRows[priorRows.length - 1] : null;

  const derived = computeFillUp(input, previous);
  // synced: false marks this as created via the explicit "Add fill-up" action and not yet
  // pushed — the only thing that makes a fill-up eligible to be pushed to Sheets. Sync never
  // infers "missing" rows by comparing against sheet content; it only ever pushes rows flagged
  // like this, so nothing gets added to the Sheet except through this form.
  const record = { ...input, ...derived, synced: false } as Omit<FillUp, 'id'> as FillUp;

  const db = await getDb();
  const id = await db.add('fillups', record);
  return { ...record, id };
}

export async function replaceVehicles(vehicles: Vehicle[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('vehicles', 'readwrite');
  await tx.store.clear();
  for (const vehicle of vehicles) {
    await tx.store.put(vehicle);
  }
  await tx.done;
}

export async function replaceFillUpsForVehicle(
  vehicleId: string,
  fillUps: Omit<FillUp, 'id'>[]
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('fillups', 'readwrite');
  const index = tx.store.index('vehicleId');
  let cursor = await index.openCursor(vehicleId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  for (const fillUp of fillUps) {
    await tx.store.add(fillUp as FillUp);
  }
  await tx.done;
}
