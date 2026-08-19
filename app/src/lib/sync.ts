import { getFillUps, replaceFillUpsForVehicle, replaceVehicles } from '../db';
import type { FillUp, Vehicle } from './fuelCalc';
import { recomputeFillUps } from './fuelCalc';
import { EXPORT_COLUMNS } from './exportFormat';
import { ensureAccessToken } from './googleAuth';
import { findSpreadsheetByName } from './googleDrive';
import {
  appendRows,
  batchUpdateValues,
  buildRange,
  createSpreadsheet,
  ensureTab,
  getTabs,
  readTab,
  removeDefaultSheetIfEmpty,
  sanitizeTabName,
  setColumnNumberFormat,
  spreadsheetUrl,
} from './googleSheetsSync';

const TWO_DECIMAL_COLUMNS = (['Liters', 'TotalPrice', 'ConsumptionL/100km', 'PricePerLiter'] as const).map(
  (name) => EXPORT_COLUMNS.indexOf(name)
);

const VEHICLES_TAB = 'Vehicles';
const SPREADSHEET_TITLE = 'Fuel Tracker Sync';

function columnLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

const DATE_COL = columnLetter(EXPORT_COLUMNS.indexOf('Date'));
const ODOMETER_COL = columnLetter(EXPORT_COLUMNS.indexOf('Odometer'));
const LITERS_COL = columnLetter(EXPORT_COLUMNS.indexOf('Liters'));
const DISTANCE_COL = columnLetter(EXPORT_COLUMNS.indexOf('Distance'));
const TOTAL_PRICE_COL = columnLetter(EXPORT_COLUMNS.indexOf('TotalPrice'));
const CONSUMPTION_COL = columnLetter(EXPORT_COLUMNS.indexOf('ConsumptionL/100km'));
const MONTH_COL = columnLetter(EXPORT_COLUMNS.indexOf('Month'));

// Derived columns are written as live formulas referencing the raw columns, so the Sheet keeps
// recalculating itself if a raw value is ever hand-edited — not just the app's own local view.
// Row 2 (the very first data row in a tab) has no previous odometer, so Distance stays blank.
//
// Argument separator is ";" rather than "," — Google Sheets uses "," as the decimal separator
// under comma-decimal locales (e.g. Serbian), which makes ";" the required function-argument
// separator even for formulas written via the API. String literals like "" and "." are untouched.
function distanceFormula(row: number): string {
  return row <= 2 ? '' : `=ROUND(${ODOMETER_COL}${row}-${ODOMETER_COL}${row - 1};0)`;
}
function consumptionFormula(row: number): string {
  return `=IF(OR(${DISTANCE_COL}${row}="";${DISTANCE_COL}${row}=0);"";ROUND(${LITERS_COL}${row}/${DISTANCE_COL}${row}*100;2))`;
}
function pricePerLiterFormula(row: number): string {
  return `=IF(${LITERS_COL}${row}=0;"";ROUND(${TOTAL_PRICE_COL}${row}/${LITERS_COL}${row};2))`;
}
// Date is stored as dd.mm.yyyy: month is characters 4-5, year is the last 4 characters
// (character positions are the same regardless of "." vs "/" as the separator).
function monthFormula(row: number): string {
  return `=MID(${DATE_COL}${row};4;2)&"."&RIGHT(${DATE_COL}${row};4)`;
}

// If a Date cell was ever typed directly into the Sheet UI (rather than written by this app),
// Sheets recognizes it as a real date and stores it as a serial number (days since 30 Dec 1899)
// instead of the plain dd.mm.yyyy text the app writes — UNFORMATTED_VALUE hands that number back
// as-is. Convert it back to text here so a manually-typed date still parses correctly.
function normalizeDateCell(value: string | number | boolean): string {
  if (typeof value === 'number') {
    const ms = Date.UTC(1899, 11, 30) + value * 86400000;
    const d = new Date(ms);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}.${d.getUTCFullYear()}`;
  }
  return String(value).trim();
}

async function resolveSpreadsheetId(token: string, cachedId: string | null): Promise<string> {
  if (cachedId) return cachedId;

  const found = await findSpreadsheetByName(token, SPREADSHEET_TITLE);
  if (found) return found;

  return createSpreadsheet(token, SPREADSHEET_TITLE, VEHICLES_TAB);
}

async function syncVehiclesTab(
  token: string,
  spreadsheetId: string,
  localVehicles: Vehicle[]
): Promise<Vehicle[]> {
  await ensureTab(token, spreadsheetId, VEHICLES_TAB);
  await removeDefaultSheetIfEmpty(token, spreadsheetId);
  let rows = await readTab(token, spreadsheetId, VEHICLES_TAB);

  if (rows.length === 0) {
    await appendRows(token, spreadsheetId, VEHICLES_TAB, [['Id', 'Name']]);
    rows = [['Id', 'Name']];
  }

  // Only vehicles explicitly created via "Add vehicle" and not yet pushed are eligible to be
  // written — never inferred by comparing against what's already in the sheet. That comparison
  // is exactly what caused spurious duplicate pushes when a manually-typed cell in the Sheet
  // didn't match the app's expected format.
  const pending = localVehicles.filter((v) => v.synced === false);
  if (pending.length) {
    await appendRows(
      token,
      spreadsheetId,
      VEHICLES_TAB,
      pending.map((v) => [v.id, v.name])
    );
  }

  const finalRows = pending.length ? await readTab(token, spreadsheetId, VEHICLES_TAB) : rows;
  return finalRows
    .slice(1)
    .filter((r) => r[0])
    .map((r) => ({ id: String(r[0]), name: String(r[1] ?? r[0]), synced: true }));
}

async function syncFillUpsTab(
  token: string,
  spreadsheetId: string,
  vehicle: Vehicle
): Promise<Omit<FillUp, 'id'>[]> {
  const tabName = sanitizeTabName(vehicle.name);
  await ensureTab(token, spreadsheetId, tabName);
  let rows = await readTab(token, spreadsheetId, tabName);

  if (rows.length === 0) {
    await appendRows(token, spreadsheetId, tabName, [[...EXPORT_COLUMNS]]);
    rows = [[...EXPORT_COLUMNS]];
  }

  const localFillUps = await getFillUps(vehicle.id);
  // Only fill-ups explicitly created via "Add fill-up" and not yet pushed are eligible to be
  // written — never inferred by comparing against what's already in the sheet. This is what
  // guarantees the app can never add a row to the Sheet except through that explicit action;
  // it also removes the exact bug where a manually-typed date the Sheet auto-converted to a
  // real date value no longer matched the app's text and got pushed again as a duplicate.
  const pending = localFillUps.filter((f) => f.synced === false);

  if (pending.length) {
    // Only the raw columns are written as literal values — Distance/Consumption/PricePerLiter/
    // Month are left blank here and filled in right after as formulas (see below), so the Sheet
    // itself stays self-consistent even if a raw value gets hand-edited later.
    const rawRows = pending.map((f) => {
      const row: unknown[] = new Array(EXPORT_COLUMNS.length).fill('');
      row[EXPORT_COLUMNS.indexOf('Date')] = f.date;
      row[EXPORT_COLUMNS.indexOf('Odometer')] = f.odometer;
      row[EXPORT_COLUMNS.indexOf('Liters')] = f.liters;
      row[EXPORT_COLUMNS.indexOf('TotalPrice')] = f.totalPrice;
      row[EXPORT_COLUMNS.indexOf('Notes')] = f.notes ?? '';
      return row;
    });

    const startRow = await appendRows(token, spreadsheetId, tabName, rawRows);
    if (startRow) {
      const formulaUpdates = pending.flatMap((_, i) => {
        const row = startRow + i;
        return [
          { range: buildRange(tabName, `${DISTANCE_COL}${row}`), values: [[distanceFormula(row)]] },
          {
            range: buildRange(tabName, `${CONSUMPTION_COL}${row}:${MONTH_COL}${row}`),
            values: [[consumptionFormula(row), pricePerLiterFormula(row), monthFormula(row)]],
          },
        ];
      });
      await batchUpdateValues(token, spreadsheetId, formulaUpdates);

      // Display-only, never touches values — also fixes the display of any older rows in the
      // same columns, so whole-number entries like "60" liters always show as "60.00".
      const tabs = await getTabs(token, spreadsheetId);
      const tab = tabs.find((t) => t.title === tabName);
      if (tab) {
        await setColumnNumberFormat(token, spreadsheetId, tab.sheetId, TWO_DECIMAL_COLUMNS, '0.00');
      }
    }
  }

  const finalRows = pending.length ? await readTab(token, spreadsheetId, tabName) : rows;

  const dateIdx = EXPORT_COLUMNS.indexOf('Date');
  const odometerIdx = EXPORT_COLUMNS.indexOf('Odometer');
  const litersIdx = EXPORT_COLUMNS.indexOf('Liters');
  const totalPriceIdx = EXPORT_COLUMNS.indexOf('TotalPrice');
  const notesIdx = EXPORT_COLUMNS.indexOf('Notes');

  const rawEntries = finalRows
    .slice(1)
    .filter((r) => r[dateIdx])
    .map((r) => ({
      date: normalizeDateCell(r[dateIdx]),
      odometer: Number(r[odometerIdx]),
      liters: Number(r[litersIdx]),
      totalPrice: Number(r[totalPriceIdx]),
      notes: r[notesIdx] !== undefined ? String(r[notesIdx]) : '',
    }));

  return recomputeFillUps(vehicle.id, rawEntries).map((f) => ({ ...f, synced: true }));
}

export interface SyncResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  vehicles: Vehicle[];
  activeVehicleId: string | null;
  fillUps: FillUp[];
}

/**
 * The single sync entry point: resolves the spreadsheet (by cached ID, else by name via Drive
 * search, else creates it), reconciles the Vehicles tab (append-only), then — if an active
 * vehicle is known or can be defaulted to the first pulled one — reconciles that vehicle's
 * fill-ups tab the same way. No spreadsheet ID ever needs to be entered manually.
 */
export async function sync(options: {
  clientId: string;
  spreadsheetId: string | null;
  activeVehicleId: string | null;
  allVehicles: Vehicle[];
}): Promise<SyncResult> {
  const token = await ensureAccessToken(options.clientId);
  const spreadsheetId = await resolveSpreadsheetId(token, options.spreadsheetId);

  const vehicles = await syncVehiclesTab(token, spreadsheetId, options.allVehicles);
  await replaceVehicles(vehicles);

  const activeVehicle =
    vehicles.find((v) => v.id === options.activeVehicleId) ?? vehicles[0] ?? null;

  let fillUps: FillUp[] = [];
  if (activeVehicle) {
    const recomputedFillUps = await syncFillUpsTab(token, spreadsheetId, activeVehicle);
    await replaceFillUpsForVehicle(activeVehicle.id, recomputedFillUps);
    fillUps = await getFillUps(activeVehicle.id);
  }

  return {
    spreadsheetId,
    spreadsheetUrl: spreadsheetUrl(spreadsheetId),
    vehicles,
    activeVehicleId: activeVehicle?.id ?? null,
    fillUps,
  };
}
