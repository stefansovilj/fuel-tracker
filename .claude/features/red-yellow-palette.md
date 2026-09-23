# Re-theme: green+purple → red+yellow

## Request
Issue #3: "Replace the UI colors to red and yellow. Primary is red while
yellow is secondary."

## Note on current state vs. CLAUDE.md
CLAUDE.md's Styling section still describes the palette as green primary /
**blue** `#0f62a8` accent. The live code's accent is actually **purple**
`#6b21a8` (see `.claude/features/purple-green-palette.md` — that swap
happened but the doc was never updated, matching that plan's explicit
"Out of scope: CLAUDE.md palette documentation" note). Treating code as
ground truth for this change, same as that prior swap did.

## Scope (size: small)
Confirmed by `grep -rn "#[0-9a-fA-F]\{3,6\}" src/` — full occurrence list:

- `src/index.css:96-98` — `nav a.active` background/border `#008542` → red
  `#b3261a`.
- `src/index.css:129-140` — base `button` background `#008542` → red
  `#b3261a`. Keeps inherited `color: #fff` (white holds on this red, see
  below).
- `src/index.css:142-147` — `button.secondary` background `#6b21a8` → yellow
  `#eab308`. **Also add `color: #1f2430`** (dark body-text navy) — see
  Contrast check, this is a deliberate invariant change, not an oversight.
  Rewrite the explanatory comment (currently purple-specific).
- `src/index.css:149-152` — `button:disabled` background `#85c5a5` (green
  white-mix tint) → `#db9791`, re-derived from the new red primary at the
  same ~52% white-mix ratio. **Add explicit `color: #fff`** so disabled
  primary and disabled secondary stay uniformly white-on-tint — without it,
  `button.secondary`'s new dark-text override would win the cascade on a
  disabled secondary button (equal specificity, but `button.secondary` is
  declared first) and disabled buttons would inconsistently mix white/dark
  text depending on class. Making it explicit removes that fragility instead
  of relying on declaration order.
- `src/index.css:243-254` — `.link-button` color `#008542` → red `#b3261a`.
- `src/components/Dashboard.tsx:80` — line chart stroke `#008542` → red
  `#b3261a`.
- `src/components/Dashboard.tsx:93` — bar fill `#008542` → red `#b3261a`.
- `src/components/Dashboard.tsx:106` — bar fill `#6b21a8` → **deepened**
  yellow `#a16207`, not the button-facing `#eab308`. See below.
- `src/components/Dashboard.tsx:119` — bar fill `#008542` → red `#b3261a`.

## Contrast check (relative luminance, WCAG formula)
- White on red `#b3261a`: **6.5:1** — clears AA (4.5:1). Comfortably distinct
  from existing error maroon `#7a0f12` (11:1 with white; the two don't read
  as the same red despite both being "red family" — maroon is dark/near-black,
  primary is saturated/bright).
- White on yellow `#eab308`: **1.9:1** — fails AA badly. This is the exact
  failure CLAUDE.md's history section records for the *previous* yellow
  accent (`#fbce07`, 2.2:1, "could only carry dark text"). Confirms
  `button.secondary` cannot keep the inherited white text for this accent.
- Dark text `#1f2430` on yellow `#eab308`: **8.1:1** — clears AAA. This is
  the color that goes on `button.secondary`.
- Deepened yellow `#a16207` on white background: **4.9:1** — holds shape as
  a solid chart bar (non-text contrast ≥3:1 per WCAG 1.4.11, with margin),
  unlike a bare `#eab308` bar which computes to the same washed-out 1.9:1
  the old `#fbce07` bar had.

This reintroduces the two-value accent/chart-color split that CLAUDE.md's
current text says not to do (`"one value for both the secondary button and
the chart... do not reintroduce one"`). That rule was true *for blue and
purple*, which had enough contrast to serve both roles from one hex. Yellow
does not, so keeping one shared value for the sake of the doc's current rule
would ship a washed-out chart bar — the two-value split is being restored
deliberately, matching the pre-blue precedent CLAUDE.md itself describes.
Flagged for the review packet; not silently done.

## Not affected
`.toast.info` (neutral `#1f2430`), `.toast.success` (`#17752f`),
`.toast.error` / `.message.error` (`#7a0f12`), `.message.success`
(`#17752f`), `.sync-status.connected` (`#17752f`), page background
(`#f7f6f3`), body text (`#1f2430`). Issue only asks for primary/secondary;
status colors are untouched.

## Out of scope
- CLAUDE.md Styling section — left stale on purpose, matching the precedent
  set by the prior blue→purple swap. Called out explicitly in the review
  packet instead so the drift is visible, not silent.
- The 4 pre-existing lint warnings in `App.tsx`.
- Success/error semantic colors, favicon.

## Verification
- `npm run build` / `npm test` / `npm run lint` — type/behavior gates; no
  logic changed, no new unit test (a hex-equals-hex assertion isn't a real
  test).
- `visual-verifier` — button.secondary sites (Dashboard export, and wherever
  else `.secondary` is used), nav active state, all 4 Dashboard charts
  (especially the deepened-yellow bar), disabled-button legibility for both
  primary and secondary, computed contrast ratios cross-checked against the
  hand-computed values above.
