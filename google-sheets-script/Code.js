// ===== Sheet setup =====

var VEHICLES_SHEET = 'Vehicles';
var LOG_SHEET = 'Log';

var LOG_HEADERS = [
  'Date', 'VehicleId', 'Odometer', 'Liters', 'TotalPrice',
  'Distance', 'ConsumptionL100km', 'PricePerLiter', 'Month', 'Notes'
];
var VEHICLES_HEADERS = ['Id', 'Name'];

function getSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getVehiclesSheet_() {
  return getSheet_(VEHICLES_SHEET, VEHICLES_HEADERS);
}

function getLogSheet_() {
  return getSheet_(LOG_SHEET, LOG_HEADERS);
}

// ===== Web app entry point =====

function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || 'form';
  var template = HtmlService.createTemplateFromFile(page === 'dashboard' ? 'Dashboard' : 'Index');
  return template.evaluate()
    .setTitle('Fuel Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ===== Vehicles =====

function getVehicles() {
  var sheet = getVehiclesSheet_();
  var rows = sheet.getDataRange().getValues();
  var vehicles = [];
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0]) {
      vehicles.push({ id: rows[i][0], name: rows[i][1] });
    }
  }
  return vehicles;
}

function addVehicle(name) {
  name = (name || '').trim();
  if (!name) throw new Error('Vehicle name is required.');

  var sheet = getVehiclesSheet_();
  var existing = getVehicles();
  var id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  var base = id;
  var suffix = 1;
  var ids = existing.map(function (v) { return v.id; });
  while (ids.indexOf(id) !== -1) {
    id = base + '-' + (++suffix);
  }

  sheet.appendRow([id, name]);
  return getVehicles();
}

// ===== Log rows =====

function getVehicleLogRows_(vehicleId) {
  var sheet = getLogSheet_();
  var data = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (row[1] === vehicleId) {
      rows.push({
        rowIndex: i + 1,
        date: row[0],
        vehicleId: row[1],
        odometer: row[2],
        liters: row[3],
        totalPrice: row[4],
        distance: row[5],
        consumption: row[6],
        pricePerLiter: row[7],
        month: row[8],
        notes: row[9]
      });
    }
  }
  rows.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
  return rows;
}

function getLastOdometer(vehicleId) {
  var rows = getVehicleLogRows_(vehicleId);
  if (rows.length === 0) return null;
  return rows[rows.length - 1].odometer;
}

function formatMonth_(date) {
  var mm = ('0' + (date.getMonth() + 1)).slice(-2);
  return mm + '.' + date.getFullYear();
}

function addFillUp(data) {
  if (!data || !data.vehicleId) throw new Error('Vehicle is required.');

  var odometer = Number(data.odometer);
  var liters = Number(data.liters);
  var totalPrice = Number(data.totalPrice);
  var date = new Date(data.date);

  if (!odometer || odometer <= 0) throw new Error('Odometer must be a positive number.');
  if (!liters || liters <= 0) throw new Error('Liters must be a positive number.');
  if (!totalPrice || totalPrice <= 0) throw new Error('Total price must be a positive number.');
  if (isNaN(date.getTime())) throw new Error('Date is invalid.');

  var priorRows = getVehicleLogRows_(data.vehicleId);
  var lastRow = priorRows.length ? priorRows[priorRows.length - 1] : null;

  if (lastRow) {
    if (date < new Date(lastRow.date)) {
      throw new Error('Date must not be earlier than the last logged fill-up (' +
        new Date(lastRow.date).toLocaleDateString() + ').');
    }
    if (odometer <= lastRow.odometer) {
      throw new Error('Odometer (' + odometer + ') must be greater than the last logged odometer (' +
        lastRow.odometer + ') for this vehicle.');
    }
  }

  var distance = lastRow ? odometer - lastRow.odometer : null;
  var consumption = distance ? Math.round((liters / distance) * 100 * 100) / 100 : null;
  var pricePerLiter = Math.round((totalPrice / liters) * 100) / 100;
  var month = formatMonth_(date);

  var sheet = getLogSheet_();
  sheet.appendRow([
    date, data.vehicleId, odometer, liters, totalPrice,
    distance, consumption, pricePerLiter, month, data.notes || ''
  ]);

  return { distance: distance, consumption: consumption, pricePerLiter: pricePerLiter, month: month };
}

// ===== Dashboard stats =====

function getStats(vehicleId) {
  var rows = getVehicleLogRows_(vehicleId).filter(function (r) { return r.distance; });

  var totalKm = 0, totalLiters = 0, totalCost = 0;
  var series = [];
  var monthly = {};

  rows.forEach(function (r) {
    totalKm += r.distance;
    totalLiters += r.liters;
    totalCost += r.totalPrice;

    series.push({
      date: Utilities.formatDate(new Date(r.date), Session.getScriptTimeZone(), 'dd.MM.yyyy'),
      consumption: r.consumption,
      pricePerLiter: r.pricePerLiter
    });

    if (!monthly[r.month]) monthly[r.month] = { liters: 0, distance: 0, cost: 0 };
    monthly[r.month].liters += r.liters;
    monthly[r.month].distance += r.distance;
    monthly[r.month].cost += r.totalPrice;
  });

  var monthlyKeys = Object.keys(monthly).sort(function (a, b) {
    var pa = a.split('.'), pb = b.split('.');
    return new Date(pa[1], pa[0] - 1) - new Date(pb[1], pb[0] - 1);
  });

  var monthlySeries = monthlyKeys.map(function (key) {
    var m = monthly[key];
    return {
      month: key,
      cost: Math.round(m.cost * 100) / 100,
      avgConsumption: Math.round((m.liters / m.distance) * 100 * 100) / 100
    };
  });

  return {
    totalKm: totalKm,
    totalLiters: Math.round(totalLiters * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    avgConsumption: totalKm ? Math.round((totalLiters / totalKm) * 100 * 100) / 100 : null,
    series: series,
    monthlySeries: monthlySeries
  };
}
