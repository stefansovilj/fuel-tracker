import type { FillUp } from './fuelCalc';

export function toExportRows(fillUps: FillUp[]) {
  return fillUps.map((f) => ({
    Date: f.date,
    Odometer: f.odometer,
    Liters: f.liters,
    Distance: f.distance ?? '',
    TotalPrice: f.totalPrice,
    'ConsumptionL/100km': f.consumption ?? '',
    PricePerLiter: f.pricePerLiter,
    Month: f.month,
    Notes: f.notes ?? '',
  }));
}

export const EXPORT_COLUMNS = [
  'Date',
  'Odometer',
  'Liters',
  'Distance',
  'TotalPrice',
  'ConsumptionL/100km',
  'PricePerLiter',
  'Month',
  'Notes',
] as const;
