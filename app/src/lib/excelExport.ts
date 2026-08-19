import * as XLSX from 'xlsx';
import type { FillUp, Vehicle } from './fuelCalc';

export function exportFillUpsToExcel(vehicle: Vehicle, fillUps: FillUp[]) {
  const rows = fillUps.map((f) => ({
    Date: new Date(f.date).toLocaleDateString(),
    Odometer: f.odometer,
    Liters: f.liters,
    Distance: f.distance ?? '',
    TotalPrice: f.totalPrice,
    'ConsumptionL/100km': f.consumption ?? '',
    PricePerLiter: f.pricePerLiter,
    Month: f.month,
    Notes: f.notes ?? '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, vehicle.name.slice(0, 31) || 'Log');

  const filename = `fuel-log-${vehicle.name.replace(/[^a-z0-9]+/gi, '-')}.xlsx`;
  XLSX.writeFile(workbook, filename);
}
