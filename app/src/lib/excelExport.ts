import * as XLSX from 'xlsx';
import type { FillUp, Vehicle } from './fuelCalc';
import { toExportRows, EXPORT_COLUMNS } from './exportFormat';

const TWO_DECIMAL_COLUMNS = ['Liters', 'TotalPrice', 'ConsumptionL/100km', 'PricePerLiter'] as const;

export function exportFillUpsToExcel(vehicle: Vehicle, fillUps: FillUp[]) {
  const rows = toExportRows(fillUps);
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Force a "0.00" number format so these columns always show 2 decimal places, even for
  // whole-number values like 60 liters, instead of Excel's default of trimming trailing zeros.
  const range = XLSX.utils.decode_range(worksheet['!ref'] ?? 'A1');
  for (const colName of TWO_DECIMAL_COLUMNS) {
    const colIndex = EXPORT_COLUMNS.indexOf(colName);
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r, c: colIndex })];
      if (cell && cell.t === 'n') {
        cell.z = '0.00';
      }
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, vehicle.name.slice(0, 31) || 'Log');

  const filename = `fuel-log-${vehicle.name.replace(/[^a-z0-9]+/gi, '-')}.xlsx`;
  XLSX.writeFile(workbook, filename);
}
