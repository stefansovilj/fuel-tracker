# Issue #5 — Recolor UI to black primary / gray secondary

## Context

CLAUDE.md's Styling section describes a green/blue palette as "current," but
that prose is stale: commit `56181f0` ("Recolor UI to red primary / yellow
secondary") changed the actual code without updating the doc. Confirmed by
grep: the real current palette is **red `#b3261a` primary / yellow `#eab308`
secondary**, not green/blue. This plan treats the grepped code as ground
truth and replaces red→black, yellow→gray.

## Resolved unknowns (assumptions)

1. **Primary black = `#000000`.** The request says "black" plainly; pure
   black is the most literal reading and trivially clears contrast (21:1
   with white).
2. **Secondary gray = `#555555`.** A pure mid-gray like `#808080` fails
   AA contrast for white text (3.95:1). `#555555` gives white text 7.46:1
   and reuses a hex already present in the app (`index.css:112`, label
   text), so it stays inside the app's existing gray vocabulary rather than
   introducing an unrelated new value.
3. **`button.secondary`'s dark-text override can be removed.** It exists
   today only because yellow fails white-text contrast. Gray at `#555555`
   passes (7.46:1), so the secondary button can revert to the documented
   default pattern — inherit white from the base `button` rule — matching
   CLAUDE.md's stated intent ("the accent carries white text... relies on
   the inherited `color: #fff`"). The comment block explaining the old
   yellow exception (`index.css:142-146`) will be rewritten to describe the
   new state and why no override is needed.
4. **Disabled-button tint re-derived, not hand-picked.** The current tint
   `#db9791` is a ~47.8% mix of the red primary into white (solved
   per-channel from `#b3261a` → `#db9791`). Applying the same mix ratio to
   black (0,0,0) yields `#858585`. This preserves the documented derivation
   discipline ("move the primary and this must be re-derived at the same
   white-mix ratio") instead of guessing a plausible-looking gray.
5. **Dashboard chart colors (`#b3261a` at lines 80, 93, 119) become black.**
   These three are tied to *primary*, not secondary, in the actual code
   (contrary to CLAUDE.md's prose, which describes the accent/secondary as
   shared with charts — that description doesn't match reality even before
   this change). Preserving current behavior means they track whatever
   primary becomes.
6. **Orphan chart color `#a16207` (Dashboard.tsx:106, "Distance per year"
   bar) is left untouched.** It's neither today's primary nor secondary and
   the issue doesn't mention it — out of scope, not a drive-by fix.
7. **Success (`#17752f`), error (`#7a0f12`), their light tints, info toast
   (`#1f2430`), page background (`#f7f6f3`), body text, muted grays (`#666`),
   and borders are untouched.** The issue only names primary/secondary.

## Files to change

- `src/index.css`
  - `nav a.active` background + border (`:96,98`): red → black
  - `button` background (`:136`): red → black
  - `.link-button` color (`:253`): red → black
  - `button.secondary` background (`:148`): yellow → `#555555`
  - `button.secondary` color override (`:149`): removed (inherits white)
  - Comment block (`:142-146`): rewritten to describe the gray/white-text
    contrast rationale instead of the old yellow exception
  - `button:disabled` tint (`:153`): `#db9791` → `#858585` (re-derived)
- `src/components/Dashboard.tsx`
  - Three `#b3261a` refs (`:80,93,119`): → `#000000`
- `CLAUDE.md`
  - Update the "Current palette" line and the three styling bullet rules to
    describe the actual new black/gray state, so the doc stops drifting
    from the code (it was already wrong before this change).

## Out of scope

- `#a16207` orphan chart color (Dashboard.tsx:106)
- Success/error colors and tints, info toast, body text, page background,
  borders, muted grays
- The 4 pre-existing lint warnings in App.tsx
- Any logic change — this is a pure value substitution

## Verification strategy

- `npm run build` / `npm test` / `npm run lint` as standard gates (color
  values are untyped strings, so these don't catch a wrong hue — they only
  confirm nothing else broke).
- No unit test: colors have no pure-logic surface in `src/lib/`. This is
  the case where "visual/manual" is correct, not a shortcut — flagged
  explicitly rather than manufacturing a fake test.
- `visual-verifier` in the browser: computed colors and contrast ratios for
  primary button, secondary button (enabled + disabled), nav active state,
  `.link-button`, and all four Dashboard charts.
