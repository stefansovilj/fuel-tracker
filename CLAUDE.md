# FuelTracker

A standalone React + TypeScript web app for logging fuel fill-ups and tracking
consumption per vehicle. Data lives in IndexedDB in the browser, with optional
sync to a Google Sheet. No backend — it deploys as static files to GitHub Pages.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server (Vite, port 5173) |
| `npm run build` | `tsc -b && vite build` — **the type gate**, must pass |
| `npm test` | Vitest, single run — **the behavior gate**, must pass |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | oxlint |

`npm run lint` currently emits **4 pre-existing warnings in `src/App.tsx`**
(3 × `set-state-in-effect`, 1 × `exhaustive-deps`). That is the accepted
baseline — do not treat them as regressions, and do not "fix" them as a
drive-by inside an unrelated change.

## Architecture

- `src/App.tsx` — top-level state and view switching (~350 lines; the largest file)
- `src/db.ts` — IndexedDB access via `idb`
- `src/lib/fuelCalc.ts` — pure derivation and aggregation logic. **No I/O, no React.**
  This is the most testable code in the project and the default home for new logic.
- `src/lib/sync.ts`, `googleAuth.ts`, `googleSheetsSync.ts`, `googleDrive.ts` —
  Google Sheets sync. The most fragile area of the codebase.
- `src/lib/fuelPrices.ts` — reads the pump-price snapshot
- `src/components/` — Dashboard, FillUpForm, History, Settings, Toast
- `scripts/fetch-fuel-prices.mjs` — run by CI, not by the app

## Invariants

Violating any of these is a defect, not a tradeoff.

1. **`TotalPrice` is the only stored price.** Price-per-liter is a form input
   used to calculate the total, then discarded. It is never persisted to
   IndexedDB or the Sheet — it is recomputed from `totalPrice / liters`.
2. **Derived columns are always recomputed, never trusted.** On a pull from the
   Sheet, the raw columns (date/odometer/liters/totalPrice/notes) are the source
   of truth and everything else is recalculated — so fixing a typo in the Sheet
   propagates correctly. See `recomputeFillUps`.
3. **`recomputeFillUps` must never throw.** One malformed row gets null derived
   fields; it must not block the whole pull. (`computeFillUp`, used for new
   local entries, *does* throw — that asymmetry is deliberate.)
4. **`recomputeFillUps` must not re-sort rows.** Sheet row order is authoritative
   and already chronological. Sorting by parsed date could scramble the
   previous-odometer chain on an ambiguous date.
5. **Fuel prices are fetched server-side only.** benzinko.com allowlists just its
   own origin for CORS and returns 403 to a browser request from the Pages
   origin. A GitHub Action writes `public/fuel-prices.json`; the app reads that
   from its own origin. Never reintroduce a client-side fetch to benzinko.
6. **IndexedDB is the source of truth; the Sheet is a sync target.** A merge that
   can lose local rows is a bug.

## Conventions

- TypeScript strict. No `any` — model the type.
- Tests live in `src/lib/__tests__/*.test.ts`, colocated by module. Import
  `describe`/`it`/`expect` explicitly from `vitest` (globals are not enabled).
- Tests assert **literal** expected values (`expect(result.consumption).toBe(8)`),
  never "is a number".
- Dates are stored as `dd.mm.yyyy` strings, months as `mm.yyyy`.

## Styling — read before any UI/color change

There are **no CSS custom properties** in this project. Colors are hardcoded
hex literals in two places, and a change to one without the other produces a
half-restyled app:

- `src/index.css` — all component styling
- `src/components/Dashboard.tsx` — **inline hex passed to Recharts** (around
  lines 80, 93, 106, 119). These are invisible to a CSS-only search.

Current palette (black and gray): `#000000` primary black, `#555555`
secondary gray, `#17752f` success green, `#7a0f12` error maroon, `#f7f6f3`
page background, `#1f2430` body text.

The three Dashboard charts that use a themed color (`Line`/`Bar` at lines 80,
93, 119) track the **primary**, not the secondary/accent — despite what an
earlier version of this doc claimed. There is a fourth, orphaned chart color
(`#a16207`, line 106, "Distance per year") that matches neither primary nor
secondary; it predates this doc revision and is left alone deliberately
rather than folded into the recolor as a drive-by.

Three rules the palette depends on:

- **The secondary carries white text, and `button.secondary` sets no `color`.**
  White on `#555555` is 7.46:1. The rule deliberately relies on the inherited
  `color: #fff` from the base `button` rule, so adding a `color` there is a
  regression, not a clarification. (This app has used at least one accent —
  yellow — that could *only* carry dark text; if you are porting an idea from
  git history, check which accent it was written for.) `button`, `nav a.active`
  and `.toast` all set `color: #fff`, so **any** color placed on those surfaces
  has to work under white text — the constraint that rules out light grays
  (e.g. `#808080` is 3.95:1 and fails) and any yellow-family accent.
- **`button:disabled` uses `#858585`, a tint derived from the primary.** It
  contains no literal `#000000`, so a find-and-replace on the primary misses
  it. It's a ~47.8% mix of the primary into white — the same ratio the
  previous red primary's disabled tint (`#db9791`) used — so moving the
  primary again means re-deriving at that same ratio, not hand-picking a
  plausible gray. It sets no `color` either, so every disabled button —
  primary *and* secondary — is white on `#858585` at 3.69:1. That is
  deliberate and uniform (WCAG 1.4.3 exempts inactive controls).
- **The `info` toast is neutral `#1f2430`, deliberately not the primary.**
  `App.tsx` maps sync state onto toast type in a single toast slot — in-progress
  is `info`, done is `success` (`#17752f`). Black now sits close in value to
  `#1f2430`, so this pair is worth a visual double-check after any further
  primary change: the constraint is that in-progress and done stay visibly
  distinct, so any change to `info` (or to the primary) has to be checked
  against `success` and against each other.

**Always `grep -rn "#[0-9a-fA-F]\{3,6\}" src/` when changing colors.** A visual
check of both the dashboard charts and the rest of the UI is required — there is
no unit test that can catch a missed chart color.

## Deployment

Push to `master` → `.github/workflows/deploy.yml` builds and publishes `dist/`
to GitHub Pages. There is no manual deploy step and no staging environment:
**merging to master is releasing to production.** Never push without a human's
explicit go-ahead.
