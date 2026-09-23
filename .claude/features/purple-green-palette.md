# Re-theme: green+blue → purple+green

## Request
Replace accent blue `#0f62a8` with purple `#6b21a8`. Keep `#008542` primary
green. Accent carries white text — contrast must hold.

## Scope (size: small)
Mechanical two-site swap, confirmed by `grep -rn "#[0-9a-fA-F]\{3,6\}" src/`:

- `src/components/Dashboard.tsx:106` — chart bar fill `#0f62a8` → `#6b21a8`
  (the only blue chart use; lines 80/93/119 are green and untouched).
- `src/index.css:146` — `button.secondary { background: #0f62a8; }` →
  `#6b21a8`. No `color` property here — keep relying on inherited
  `color: #fff` from the base `button` rule.
- `src/index.css:142-144` — comment cites the old hex and old ratio; rewrite
  with new hex and new contrast figure.

## Contrast check
White (`#fff`) on `#6b21a8` (107, 33, 168): relative luminance ≈ 0.0705,
contrast ratio ≈ **8.7:1** — clears WCAG AA (4.5:1) and AAA (7:1), higher than
the outgoing blue's 6.3:1. Dark text (`#1f2430`) on the same purple is
≈1.85:1 — confirms white text is the only viable choice, same as before.

## Not affected
`nav a.active`, base `button`, `button:disabled` (`#85c5a5`, derived from
primary green — green isn't moving, no re-derivation needed), `.toast.info`
(neutral `#1f2430`), `.toast.success`/`.toast.error`, page background/body
text. None reference blue.

## Out of scope
- `CLAUDE.md` palette documentation naming `#0f62a8`/"blue" — documentation
  update, left for a follow-up since project instruction files aren't edited
  as a side effect of a feature change.
- `public/favicon.png` (blue square) — deferred previously, deferred again.
- The 4 pre-existing lint warnings in `App.tsx`.

## Verification
- `npm run build` / `npm test` / `npm run lint` — type/behavior gates; no
  logic changed, so no new unit tests (asserting a hex string equals itself
  is not a real test).
- `visual-verifier` — six `button.secondary` sites (Dashboard export, History
  sync, Settings actions), the one purple chart bar (with seeded data), and
  disabled-state legibility. This is the only gate that can catch a wrong
  color.
