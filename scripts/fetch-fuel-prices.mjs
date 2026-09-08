// Fetches the current pump prices and writes them to public/fuel-prices.json, which the app
// loads same-origin at runtime.
//
// This has to run server-side: the API allowlists exactly one CORS origin (https://benzinko.com),
// so a browser fetch from the GitHub Pages origin is answered with 403 on both the preflight and
// the GET. A request with no Origin header — curl, Node, this script — is answered normally.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SOURCE_URL = 'https://benzinko.com/server/api/stations/featured';
const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fuel-prices.json');

// Serbia's basic diesel, sold under a different display name by every chain ("Evro Dizel" at NIS
// and OMV, "Maingrade Dizel" at MOL, "Diesel Economy" at EKO) but always the same fuel id. Used
// only as a sanity check that the response is the real thing before overwriting a good snapshot.
const REQUIRED_STATION_ID = 4; // Nis Petrol
const REQUIRED_FUEL_ID = 4; // Evro Dizel

function reshape(payload) {
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error('Expected a non-empty array of stations.');
  }

  return payload
    .filter((station) => station.enabled !== false)
    .map((station) => ({
      id: station.id,
      name: station.name,
      fuels: (station.fuels ?? [])
        .map((fuel) => {
          const latest = fuel.prices?.[0];
          if (!latest || typeof latest.price !== 'number' || latest.price <= 0) return null;
          return {
            id: fuel.id,
            displayName: fuel.displayName,
            category: fuel.category,
            price: latest.price,
            pricedAt: latest.createdOn ?? null,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.id - b.id),
    }))
    .filter((station) => station.fuels.length > 0)
    .sort((a, b) => a.id - b.id);
}

const response = await fetch(SOURCE_URL, { headers: { Accept: 'application/json' } });
if (!response.ok) {
  throw new Error(`${SOURCE_URL} returned HTTP ${response.status}.`);
}

const stations = reshape(await response.json());

const reference = stations
  .find((s) => s.id === REQUIRED_STATION_ID)
  ?.fuels.find((f) => f.id === REQUIRED_FUEL_ID);
if (!reference) {
  throw new Error(
    `Station ${REQUIRED_STATION_ID} / fuel ${REQUIRED_FUEL_ID} missing from the response — ` +
      'refusing to overwrite the existing snapshot.'
  );
}

const snapshot = {
  fetchedAt: new Date().toISOString(),
  source: SOURCE_URL,
  currency: 'RSD',
  stations,
};

writeFileSync(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Wrote ${OUTPUT} — reference price ${reference.price} RSD/L (${reference.displayName}).`);
