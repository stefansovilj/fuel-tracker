export interface Vehicle {
  id: string;
  name: string;
}

export interface FillUpInput {
  vehicleId: string;
  date: string; // yyyy-mm-dd
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
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatMonth(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${mm}.${date.getFullYear()}`;
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
  const date = new Date(input.date);

  if (!odometer || odometer <= 0) throw new Error('Odometer must be a positive number.');
  if (!liters || liters <= 0) throw new Error('Liters must be a positive number.');
  if (!totalPrice || totalPrice <= 0) throw new Error('Total price must be a positive number.');
  if (Number.isNaN(date.getTime())) throw new Error('Date is invalid.');

  if (previous) {
    const previousDate = new Date(previous.date);
    if (date < previousDate) {
      throw new Error(
        `Date must not be earlier than the last logged fill-up (${previousDate.toLocaleDateString()}).`
      );
    }
    if (odometer <= previous.odometer) {
      throw new Error(
        `Odometer (${odometer}) must be greater than the last logged odometer (${previous.odometer}) for this vehicle.`
      );
    }
  }

  const distance = previous ? odometer - previous.odometer : null;
  const consumption = distance ? round2((liters / distance) * 100) : null;
  const pricePerLiter = round2(totalPrice / liters);
  const month = formatMonth(date);

  return { distance, consumption, pricePerLiter, month };
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

export interface Stats {
  totalKm: number;
  totalLiters: number;
  totalCost: number;
  avgConsumption: number | null;
  series: SeriesPoint[];
  monthlySeries: MonthlyPoint[];
}

export function aggregateStats(fillUps: FillUp[]): Stats {
  const withDistance = fillUps.filter((f): f is FillUp & { distance: number } => !!f.distance);

  let totalKm = 0;
  let totalLiters = 0;
  let totalCost = 0;
  const series: SeriesPoint[] = [];
  const monthly = new Map<string, { liters: number; distance: number; cost: number }>();

  for (const f of withDistance) {
    totalKm += f.distance;
    totalLiters += f.liters;
    totalCost += f.totalPrice;

    series.push({
      date: new Date(f.date).toLocaleDateString(),
      consumption: f.consumption,
      pricePerLiter: f.pricePerLiter,
    });

    const bucket = monthly.get(f.month) ?? { liters: 0, distance: 0, cost: 0 };
    bucket.liters += f.liters;
    bucket.distance += f.distance;
    bucket.cost += f.totalPrice;
    monthly.set(f.month, bucket);
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

  return {
    totalKm,
    totalLiters: round2(totalLiters),
    totalCost: round2(totalCost),
    avgConsumption: totalKm ? round2((totalLiters / totalKm) * 100) : null,
    series,
    monthlySeries,
  };
}
