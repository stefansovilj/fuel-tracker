export interface Vehicle {
  id: string;
  name: string;
  /** false = created locally via the Add feature and not yet pushed to Sheets; true/undefined = already in sync with the sheet (undefined covers records created before this flag existed). */
  synced?: boolean;
}

export interface FillUpInput {
  vehicleId: string;
  date: string; // dd.mm.yyyy
  odometer: number;
  liters: number;
  totalPrice: number;
  notes?: string;
}

export interface FillUp extends FillUpInput {
  id: number;
  distance: number | null;
  consumption: number | null;
  pricePerLiter: number;
  month: string;
  /** false = created locally via the Add feature and not yet pushed to Sheets; true/undefined = already in sync with the sheet (undefined covers records created before this flag existed). */
  synced?: boolean;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Formats a decimal value for display with exactly 2 decimal places, even if they're .00. */
export function fixed2(value: number): string {
  return value.toFixed(2);
}

/** Parses our stored dd.mm.yyyy format back into a Date object. */
export function parseStoredDate(value: string): Date {
  const [d, m, y] = value.split('.').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatMonth(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${mm}.${date.getFullYear()}`;
}

function deriveFields(
  odometer: number,
  liters: number,
  totalPrice: number,
  date: Date,
  previousOdometer: number | null
): Pick<FillUp, 'distance' | 'consumption' | 'pricePerLiter' | 'month'> {
  const distance =
    previousOdometer !== null && odometer > previousOdometer
      ? Math.round(odometer - previousOdometer)
      : null;
  const consumption = distance ? round2((liters / distance) * 100) : null;
  const pricePerLiter = round2(totalPrice / liters);
  const month = formatMonth(date);

  return { distance, consumption, pricePerLiter, month };
}

/**
 * Computes the derived fields for a new fill-up given the previous one for the
 * same vehicle (or null if this is the first entry). Throws if the entry would
 * be out of order — mirrors the validation in the original Apps Script backend.
 */
export function computeFillUp(
  input: FillUpInput,
  previous: FillUp | null
): Pick<FillUp, 'distance' | 'consumption' | 'pricePerLiter' | 'month'> {
  const odometer = Number(input.odometer);
  const liters = Number(input.liters);
  const totalPrice = Number(input.totalPrice);
  const date = parseStoredDate(input.date);

  if (!odometer || odometer <= 0) throw new Error('Odometer must be a positive number.');
  if (!liters || liters <= 0) throw new Error('Liters must be a positive number.');
  if (!totalPrice || totalPrice <= 0) throw new Error('Total price must be a positive number.');
  if (Number.isNaN(date.getTime())) throw new Error('Date is invalid.');

  if (previous) {
    const previousDate = parseStoredDate(previous.date);
    if (date < previousDate) {
      throw new Error(`Date must not be earlier than the last logged fill-up (${previous.date}).`);
    }
    if (odometer <= previous.odometer) {
      throw new Error(
        `Odometer (${odometer}) must be greater than the last logged odometer (${previous.odometer}) for this vehicle.`
      );
    }
  }

  return deriveFields(odometer, liters, totalPrice, date, previous ? previous.odometer : null);
}

export interface RawFillUpEntry {
  date: string;
  odometer: number;
  liters: number;
  totalPrice: number;
  notes?: string;
}

/**
 * Rebuilds full FillUp records from raw inputs only (date/odometer/liters/totalPrice/notes) —
 * used after pulling rows back from a Google Sheet, where the raw columns are treated as the
 * source of truth and the derived columns (distance/consumption/...) are always recomputed
 * locally rather than trusted, so a manual edit to a raw value (e.g. fixing a Liters typo)
 * is reflected correctly. Unlike computeFillUp, this never throws on out-of-order data —
 * a row that doesn't fit (e.g. a lower odometer than the previous one) just gets a null
 * distance/consumption instead of blocking the whole pull.
 *
 * Deliberately does NOT re-sort by parsing the date string — rows are processed in exactly the
 * order given (the Sheet's own row order, which is always chronological since new rows are only
 * ever appended at the end), so a date that's ambiguous or hard to parse can never scramble the
 * sequence used for the previous-odometer chain.
 */
export function recomputeFillUps(vehicleId: string, rawEntries: RawFillUpEntry[]): Omit<FillUp, 'id'>[] {
  let previousOdometer: number | null = null;
  return rawEntries.map((entry) => {
    const odometer = Number(entry.odometer);
    const liters = Number(entry.liters);
    const totalPrice = Number(entry.totalPrice);
    const date = parseStoredDate(entry.date);

    const derived = deriveFields(odometer, liters, totalPrice, date, previousOdometer);
    previousOdometer = odometer;

    return {
      vehicleId,
      date: entry.date,
      odometer,
      liters,
      totalPrice,
      notes: entry.notes ?? '',
      ...derived,
    };
  });
}

export interface SeriesPoint {
  date: string;
  consumption: number | null;
  pricePerLiter: number;
}

export interface MonthlyPoint {
  month: string;
  cost: number;
  avgConsumption: number;
}

export interface YearlyPoint {
  year: string;
  km: number;
  cost: number;
}

export interface Stats {
  totalKm: number;
  totalLiters: number;
  totalCost: number;
  avgConsumption: number | null;
  fillUpCount: number;
  monthsTracked: number;
  avgMonthlyKm: number | null;
  avgMonthlyCost: number | null;
  series: SeriesPoint[];
  monthlySeries: MonthlyPoint[];
  yearlySeries: YearlyPoint[];
}

export function aggregateStats(fillUps: FillUp[]): Stats {
  const withDistance = fillUps.filter((f): f is FillUp & { distance: number } => !!f.distance);

  // Liters/cost/fill-up count include every logged fill-up — even the very first one, which
  // never has a computed distance (there's no previous odometer to diff against) but still
  // cost real money. Distance-dependent figures (km, consumption, per-year km) only ever come
  // from entries where a distance could actually be computed.
  let totalLiters = 0;
  let totalCost = 0;
  const yearly = new Map<string, { km: number; cost: number }>();

  for (const f of fillUps) {
    totalLiters += f.liters;
    totalCost += f.totalPrice;

    const year = f.date.split('.').pop() ?? '';
    const bucket = yearly.get(year) ?? { km: 0, cost: 0 };
    bucket.cost += f.totalPrice;
    yearly.set(year, bucket);
  }

  let totalKm = 0;
  const series: SeriesPoint[] = [];
  const monthly = new Map<string, { liters: number; distance: number; cost: number }>();

  for (const f of withDistance) {
    totalKm += f.distance;

    series.push({
      date: f.date,
      consumption: f.consumption,
      pricePerLiter: f.pricePerLiter,
    });

    const monthBucket = monthly.get(f.month) ?? { liters: 0, distance: 0, cost: 0 };
    monthBucket.liters += f.liters;
    monthBucket.distance += f.distance;
    monthBucket.cost += f.totalPrice;
    monthly.set(f.month, monthBucket);

    const year = f.date.split('.').pop() ?? '';
    const yearBucket = yearly.get(year) ?? { km: 0, cost: 0 };
    yearBucket.km += f.distance;
    yearly.set(year, yearBucket);
  }

  const monthlySeries: MonthlyPoint[] = Array.from(monthly.entries())
    .sort(([a], [b]) => {
      const [ma, ya] = a.split('.').map(Number);
      const [mb, yb] = b.split('.').map(Number);
      return ya - yb || ma - mb;
    })
    .map(([month, bucket]) => ({
      month,
      cost: round2(bucket.cost),
      avgConsumption: round2((bucket.liters / bucket.distance) * 100),
    }));

  const yearlySeries: YearlyPoint[] = Array.from(yearly.entries())
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, bucket]) => ({ year, km: bucket.km, cost: round2(bucket.cost) }));

  const dates = fillUps.map((f) => parseStoredDate(f.date)).filter((d) => !Number.isNaN(d.getTime()));
  let monthsTracked = 0;
  if (dates.length) {
    const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));
    const latest = new Date(Math.max(...dates.map((d) => d.getTime())));
    monthsTracked =
      (latest.getFullYear() - earliest.getFullYear()) * 12 + (latest.getMonth() - earliest.getMonth()) + 1;
  }

  return {
    totalKm,
    totalLiters: round2(totalLiters),
    totalCost: round2(totalCost),
    avgConsumption: totalKm ? round2((totalLiters / totalKm) * 100) : null,
    fillUpCount: fillUps.length,
    monthsTracked,
    avgMonthlyKm: monthsTracked ? round2(totalKm / monthsTracked) : null,
    avgMonthlyCost: monthsTracked ? round2(totalCost / monthsTracked) : null,
    series,
    monthlySeries,
    yearlySeries,
  };
}
