import { getFillUps, replaceFillUpsForVehicle, replaceVehicles } from '../db';
import type { FillUp, Vehicle } from './fuelCalc';
import { recomputeFillUps } from './fuelCalc';
import { toExportRows, EXPORT_COLUMNS } from './exportFormat';
import { ensureAccessToken } from './googleAuth';
import {
  appendRows,
  createSpreadsheet,
  ensureTab,
  readTab,
  sanitizeTabName,
  spreadsheetUrl,
} from './googleSheetsSync';

const VEHICLES_TAB = 'Vehicles';
const SPREADSHEET_TITLE = 'Fuel Tracker Sync';

async function syncVehiclesTab(
  token: string,
  spreadsheetId: string,
  localVehicles: Vehicle[]
): Promise<Vehicle[]> {
  await ensureTab(token, spreadsheetId, VEHICLES_TAB);
  let rows = await readTab(token, spreadsheetId, VEHICLES_TAB);

  if (rows.length === 0) {
    await appendRows(token, spreadsheetId, VEHICLES_TAB, [['Id', 'Name']]);
    rows = [['Id', 'Name']];
  }

  const existingIds = new Set(rows.slice(1).map((r) => r[0]));
  const missing = localVehicles.filter((v) => !existingIds.has(v.id));
  if (missing.length) {
    await appendRows(
      token,
      spreadsheetId,
      VEHICLES_TAB,
      missing.map((v) => [v.id, v.name])
    );
  }

  const finalRows = missing.length ? await readTab(token, spreadsheetId, VEHICLES_TAB) : rows;
  return finalRows
    .slice(1)
    .filter((r) => r[0])
    .map((r) => ({ id: String(r[0]), name: String(r[1] ?? r[0]) }));
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

  const dateIdx = EXPORT_COLUMNS.indexOf('Date');
  const odometerIdx = EXPORT_COLUMNS.indexOf('Odometer');
  const existingKeys = new Set(rows.slice(1).map((r) => `${r[dateIdx]}|${r[odometerIdx]}`));

  const localFillUps = await getFillUps(vehicle.id);
  const newFillUps = localFillUps.filter((f) => !existingKeys.has(`${f.date}|${f.odometer}`));

  if (newFillUps.length) {
    const exportRows = toExportRows(newFillUps);
    const arrayRows = exportRows.map((row) => EXPORT_COLUMNS.map((col) => row[col]));
    await appendRows(token, spreadsheetId, tabName, arrayRows);
  }

  const finalRows = newFillUps.length ? await readTab(token, spreadsheetId, tabName) : rows;

  const litersIdx = EXPORT_COLUMNS.indexOf('Liters');
  const totalPriceIdx = EXPORT_COLUMNS.indexOf('TotalPrice');
  const notesIdx = EXPORT_COLUMNS.indexOf('Notes');

  const rawEntries = finalRows
    .slice(1)
    .filter((r) => r[dateIdx])
    .map((r) => ({
      date: String(r[dateIdx]),
      odometer: Number(r[odometerIdx]),
      liters: Number(r[litersIdx]),
      totalPrice: Number(r[totalPriceIdx]),
      notes: r[notesIdx] !== undefined ? String(r[notesIdx]) : '',
    }));

  return recomputeFillUps(vehicle.id, rawEntries);
}

export interface SyncResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  vehicles: Vehicle[];
  fillUps: FillUp[];
}

/**
 * Pulls (and pushes anything locally new) the Vehicles tab only — used on a device that doesn't
 * have an active vehicle selected yet, so it can discover what vehicles already exist in an
 * existing spreadsheet before a specific vehicle's fill-ups can be synced.
 */
export async function pullVehicles(options: {
  clientId: string;
  spreadsheetId: string;
  allVehicles: Vehicle[];
}): Promise<Vehicle[]> {
  const token = await ensureAccessToken(options.clientId);
  const vehicles = await syncVehiclesTab(token, options.spreadsheetId, options.allVehicles);
  await replaceVehicles(vehicles);
  return vehicles;
}

export async function syncActiveVehicle(options: {
  clientId: string;
  spreadsheetId: string | null;
  vehicle: Vehicle;
  allVehicles: Vehicle[];
}): Promise<SyncResult> {
  const token = await ensureAccessToken(options.clientId);

  const spreadsheetId =
    options.spreadsheetId ?? (await createSpreadsheet(token, SPREADSHEET_TITLE));

  const vehicles = await syncVehiclesTab(token, spreadsheetId, options.allVehicles);
  await replaceVehicles(vehicles);

  const recomputedFillUps = await syncFillUpsTab(token, spreadsheetId, options.vehicle);
  await replaceFillUpsForVehicle(options.vehicle.id, recomputedFillUps);
  const fillUps = await getFillUps(options.vehicle.id);

  return {
    spreadsheetId,
    spreadsheetUrl: spreadsheetUrl(spreadsheetId),
    vehicles,
    fillUps,
  };
}
