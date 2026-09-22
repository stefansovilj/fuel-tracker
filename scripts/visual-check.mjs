// Visual + computed-style check for the palette and button states.
//
// Why this exists: build/test/lint cannot fail for a color reason. This script turns the
// parts of a UI change that ARE machine-checkable (computed colors, contrast ratios, the
// info/success toast invariant) into a real gate, and screenshots the rest for a human.
//
// Not a Vitest test: it needs a browser and a running dev server, so `npm test` stays
// fast and hermetic. Run it from the /feature pipeline or by hand.
//
// Needs `playwright-core` and a Chromium. Neither is a project dependency — this is a
// dev-time tool and FuelTracker ships as static files, so nothing here reaches the bundle.
//
//   npm run dev                                  # in another shell
//   mkdir -p /tmp/pw && (cd /tmp/pw && npm i playwright-core)
//   PW_CORE=/tmp/pw/node_modules/playwright-core node scripts/visual-check.mjs
//
// Env: APP_URL (default http://localhost:5173/), SHOT_DIR, PW_CORE, CHROME_EXE.
// Exits non-zero if an enabled control fails contrast or the toast invariant breaks.

import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const URL_ = process.env.APP_URL || 'http://localhost:5173/';
const OUT = process.env.SHOT_DIR || path.join(os.tmpdir(), 'fueltracker-shots');

// playwright-core is CJS, and ESM has no directory resolution, so PW_CORE (a path) has to
// go through require() rather than import().
async function loadChromium() {
  const req = createRequire(import.meta.url);
  const attempts = [];
  if (process.env.PW_CORE) {
    const base = path.resolve(process.env.PW_CORE);
    attempts.push(base, path.join(base, 'playwright-core'), path.join(base, 'node_modules/playwright-core'));
  }
  for (const p of attempts) {
    try { return req(p).chromium; } catch { /* next */ }
  }
  for (const name of ['playwright-core', 'playwright']) {
    try { return req(name).chromium; } catch { /* next */ }
    try { return (await import(name)).chromium; } catch { /* next */ }
  }
  throw new Error(
    'Could not load playwright-core. Install it somewhere and pass PW_CORE=<path>:\n' +
    '  mkdir -p /tmp/pw && (cd /tmp/pw && npm i playwright-core)\n' +
    '  PW_CORE=/tmp/pw/node_modules/playwright-core node scripts/visual-check.mjs'
  );
}

// Find a Chromium without pinning a build number — the cache dir name changes per version.
function findChrome() {
  if (process.env.CHROME_EXE) return process.env.CHROME_EXE;
  const roots = [
    path.join(os.homedir(), 'AppData/Local/ms-playwright'),
    path.join(os.homedir(), '.cache/ms-playwright'),
    path.join(os.homedir(), 'Library/Caches/ms-playwright'),
  ].filter(existsSync);
  for (const root of roots) {
    const builds = readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse();
    for (const dir of builds) {
      for (const rel of [
        'chrome-win64/chrome.exe',
        'chrome-linux/chrome',
        'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
      ]) {
        const p = path.join(root, dir, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  for (const p of [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]) if (existsSync(p)) return p;
  throw new Error('No Chromium found. Set CHROME_EXE=<path to a chrome/edge binary>.');
}

// --- WCAG 2.1 relative luminance + contrast ---------------------------------
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const relLum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const parseRgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
function contrast(fg, bg) {
  const [l1, l2] = [relLum(parseRgb(fg)), relLum(parseRgb(bg))];
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
const toHex = (s) => '#' + parseRgb(s).map((n) => n.toString(16).padStart(2, '0')).join('');

// 6 fill-ups over 3 months and 2 years, so all four charts have something to draw. An
// empty dataset renders bare axes and would hide a wrong chart color completely.
const SEED = [
  ['05.01.2024', 10000, 40, 6000], ['02.02.2024', 10500, 42, 6300],
  ['08.03.2024', 11050, 39, 5900], ['11.01.2025', 11600, 45, 7200],
  ['19.02.2025', 12150, 41, 6800], ['23.03.2025', 12700, 43, 7100],
];
const NAV = ['form', 'history', 'dashboard', 'settings'];

const chromium = await loadChromium();
const browser = await chromium.launch({ executablePath: findChrome() });
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
mkdirSync(OUT, { recursive: true });

const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(URL_, { waitUntil: 'networkidle' });

// Seed through the app's own object stores, then reload. Deliberately NOT by driving the
// form: this must not depend on the form working, and must not re-create the schema.
await page.evaluate(async (rows) => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('fuel-tracker', 1);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  await new Promise((res, rej) => {
    const tx = db.transaction(['vehicles', 'fillups'], 'readwrite');
    tx.objectStore('vehicles').put({ id: 'visual-check', name: 'Visual Check', synced: true });
    const store = tx.objectStore('fillups');
    let prev = null;
    for (const [date, odometer, liters, totalPrice] of rows) {
      const distance = prev !== null && odometer > prev ? Math.round(odometer - prev) : null;
      const parts = date.split('.').map(Number);
      store.add({
        vehicleId: 'visual-check', date, odometer, liters, totalPrice, distance,
        consumption: distance ? Math.round((liters / distance) * 10000) / 100 : null,
        pricePerLiter: Math.round((totalPrice / liters) * 100) / 100,
        month: String(parts[1]).padStart(2, '0') + '.' + parts[2], synced: true,
      });
      prev = odometer;
    }
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}, SEED);
await page.reload({ waitUntil: 'networkidle' });

const rows = [];
const failures = [];
const seenSecondary = new Set();

for (let i = 0; i < NAV.length; i++) {
  await page.click(`nav a:nth-of-type(${i + 1})`);
  await page.waitForTimeout(700); // let Recharts finish its entry animation
  const buttons = await page.$$eval('button', (els) => els.map((el) => {
    const cs = getComputedStyle(el);
    return {
      text: (el.textContent || '').trim().slice(0, 28),
      secondary: el.classList.contains('secondary'),
      disabled: el.disabled,
      bg: cs.backgroundColor,
      fg: cs.color,
    };
  }));
  for (const b of buttons) {
    const ratio = +contrast(b.fg, b.bg).toFixed(2);
    rows.push({ view: NAV[i], ...b, bgHex: toHex(b.bg), fgHex: toHex(b.fg), ratio });
    if (b.secondary) seenSecondary.add(b.text);
    // Enabled controls are gated. Disabled ones are exempt under WCAG 1.4.3 but still printed.
    if (!b.disabled && ratio < 3.0) {
      failures.push(
        `contrast ${ratio}:1 on enabled "${b.text}" (${NAV[i]}) — ${toHex(b.fg)} on ${toHex(b.bg)}`
      );
    }
  }
  await page.screenshot({ path: path.join(OUT, `${i + 1}-${NAV[i]}.png`), fullPage: true });
}

// .toast.info/.success/.error are pure CSS, so injecting the markup exercises the real
// rules. This does NOT prove App.tsx's sync-state -> toast-type mapping.
await page.evaluate(() => {
  const wrap = document.createElement('div');
  wrap.id = 'toast-probe';
  wrap.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:9999';
  for (const t of ['info', 'success', 'error']) {
    const d = document.createElement('div');
    d.className = 'toast ' + t;
    d.style.cssText = 'position:static;margin-top:8px;max-width:none;animation:none';
    d.textContent = t + ' toast';
    wrap.appendChild(d);
  }
  document.body.appendChild(wrap);
});
const toasts = await page.$$eval('#toast-probe .toast', (els) => els.map((el) => {
  const cs = getComputedStyle(el);
  return { cls: el.className, bg: cs.backgroundColor, fg: cs.color };
}));
for (const t of toasts) {
  rows.push({
    view: 'toast', text: t.cls.replace('toast ', ''), secondary: false, disabled: false,
    bg: t.bg, fg: t.fg, bgHex: toHex(t.bg), fgHex: toHex(t.fg),
    ratio: +contrast(t.fg, t.bg).toFixed(2),
  });
}
const bgOf = (n) => (toasts.find((t) => t.cls.includes(n)) || {}).bg;
if (bgOf('info') && bgOf('info') === bgOf('success')) {
  failures.push('invariant: .toast.info and .toast.success share a background — a sync would show no state change');
}
await page.screenshot({ path: path.join(OUT, '5-toasts.png') });
await browser.close();

console.log('\n=== COMPUTED STYLES (live DOM, not the source) ===');
for (const r of rows) {
  console.log([
    r.view.padEnd(9),
    (r.view === 'toast' ? '—' : r.secondary ? 'secondary' : 'primary').padEnd(9),
    (r.disabled ? 'DISABLED' : 'enabled '),
    r.fgHex + ' on ' + r.bgHex,
    String(r.ratio).padStart(6) + ':1',
    r.text,
  ].join('  '));
}
console.log('\n=== SECONDARY BUTTONS REACHED: ' + seenSecondary.size + ' ===');
console.log('  ' + [...seenSecondary].join(', '));
console.log('  Not reachable without a connected Google account: Disconnect (Settings.tsx:207)');
console.log('\n=== SCREENSHOTS ===');
for (const f of readdirSync(OUT).filter((f) => f.endsWith('.png')).sort()) {
  console.log('  ' + path.join(OUT, f));
}
console.log('\n=== CONSOLE ERRORS ===');
console.log(consoleErrors.length ? consoleErrors.map((e) => '  ' + e).join('\n') : '  none');
console.log('\n=== VERDICT ===');
if (failures.length) {
  console.log(failures.map((f) => '  FAIL ' + f).join('\n'));
  console.log('\nRESULT: FAIL');
  process.exitCode = 1;
} else {
  console.log('  no contrast failure on an enabled control; toast invariant holds');
  console.log('\nRESULT: PASS');
}
