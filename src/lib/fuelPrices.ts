/**
 * Pump prices used to prefill the price-per-liter field on the Add form.
 *
 * The prices are not fetched from the price API directly: it allowlists only its own origin for
 * CORS, so a browser request from this app is refused with a 403. Instead a scheduled workflow
 * (.github/workflows/fuel-prices.yml) fetches them server-side and commits the result as
 * public/fuel-prices.json, which is served from our own origin alongside the app.
 */

export interface FuelPrice {
  id: number;
  displayName: string;
  category: string;
  price: number;
  pricedAt: string | null;
}

export interface FuelStation {
  id: number;
  name: string;
  fuels: FuelPrice[];
}

export interface FuelPriceSnapshot {
  fetchedAt: string;
  source: string;
  currency: string;
  stations: FuelStation[];
}

/** Nis Petrol / Evro Dizel — Serbia's basic (capped) diesel, the default prefill. */
export const DEFAULT_STATION_ID = 4;
export const DEFAULT_FUEL_ID = 4;

const CACHE_KEY = 'fuel-tracker:fuelPrices';

export interface LoadedSnapshot {
  snapshot: FuelPriceSnapshot;
  /** true when the network copy couldn't be loaded and this came from localStorage instead. */
  fromCache: boolean;
}

function isSnapshot(value: unknown): value is FuelPriceSnapshot {
  const candidate = value as FuelPriceSnapshot | null;
  return !!candidate && Array.isArray(candidate.stations) && candidate.stations.length > 0;
}

function readCache(): FuelPriceSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Loads the snapshot, preferring the freshly served file and falling back to the last one cached
 * in localStorage (so the field still prefills offline). Returns null when neither is available —
 * the caller then just leaves the price field blank for manual entry; this never throws, since a
 * missing convenience must not block logging a fill-up.
 */
export async function loadFuelPrices(): Promise<LoadedSnapshot | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}fuel-prices.json`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed: unknown = await response.json();
    if (!isSnapshot(parsed)) throw new Error('Malformed snapshot.');
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
    } catch {
      // A full or unavailable localStorage only costs us the offline fallback.
    }
    return { snapshot: parsed, fromCache: false };
  } catch {
    const cached = readCache();
    return cached ? { snapshot: cached, fromCache: true } : null;
  }
}

/**
 * Resolves one station's fuel, falling back to the Nis Petrol / Evro Dizel default when the
 * configured selection is no longer in the payload (a station or grade can disappear).
 */
export function resolveFuel(
  snapshot: FuelPriceSnapshot | null,
  stationId: number,
  fuelId: number
): { station: FuelStation; fuel: FuelPrice } | null {
  if (!snapshot) return null;

  const pick = (sId: number, fId: number) => {
    const station = snapshot.stations.find((s) => s.id === sId);
    const fuel = station?.fuels.find((f) => f.id === fId);
    return station && fuel ? { station, fuel } : null;
  };

  return pick(stationId, fuelId) ?? pick(DEFAULT_STATION_ID, DEFAULT_FUEL_ID);
}

/** Formats the API's ISO-ish timestamps ("2026-09-04T10:25:56") as dd.mm.yyyy for display. */
export function formatPricedAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${date.getFullYear()}`;
}
