# Green + blue palette

## Context

FuelTracker wore green + yellow (`#008542` primary green, `#fbce07` accent
yellow, `#e8a100` chart yellow) after commit `6282a11` re-themed it from Shell
red + yellow. The request was to move the accent from yellow to blue so the app
reads green + blue.

A pure presentation change: no logic, types, storage or network code, so none of
the six project invariants were in play. The risk was entirely *incompleteness* —
colors live in two places no single search covers (`src/index.css` and inline
Recharts props in `Dashboard.tsx`), and a half-restyled app ships straight to
production because merging to master is releasing.

Precedent: `.claude/features/shell-palette.md`, the red+yellow re-theme.

## Decisions

- **Green stays primary; blue replaces yellow as the accent.** Word order in the
  request, and the two prior themes were both primary+accent pairs. The other
  reading — blue primary, green demoted — is a much wider diff (all four
  `#008542` sites, the derived `#85c5a5` tint, three of four charts).
- **The primary green does not move.** This is what keeps `button:disabled`'s
  derived tint `#85c5a5` correct without re-derivation — historically the most
  easily-missed line in a palette change here.
- **One blue serves both the button and the chart.** Yellow needed the deepened
  `#e8a100` for charts because `#fbce07` is 2.2:1 on white and washed out.
  `#0f62a8` is 6.3:1 and holds its shape, so a second variant would be
  unjustified. The palette shrinks from 7 named colors to 6.
- **Error maroon, page background and favicon unchanged.** See Out of scope.

## Palette

| Role | Old | New |
| --- | --- | --- |
| Primary | `#008542` green | unchanged |
| Primary disabled tint | `#85c5a5` | unchanged (primary did not move) |
| Accent | `#fbce07` yellow, dark text | **`#0f62a8` blue, white text** |
| Chart accent | `#e8a100` deepened yellow | **`#0f62a8`** — same blue, no variant |
| Success | `#17752f` green | unchanged |
| Error | `#7a0f12` maroon | unchanged |
| Page background | `#f7f6f3` | unchanged |
| Body text | `#1f2430` | unchanged |

Measured contrast for `#0f62a8` (WCAG 2.1, computed):

- white text on it: **6.30:1** — passes AA, more headroom than the primary
  green's own 4.74:1
- dark `#1f2430` on it: **2.46:1** — fails, which is why the override inverts
- as a chart bar on white: **6.30:1** (the outgoing chart yellow was 2.20:1)

## The one non-mechanical edit

`button.secondary` was the only place in the app overriding the base button's
inherited `color: #fff`, and that override existed *because* the accent was
yellow. With a mid-dark blue the rule inverts:

```css
/* before — correct for yellow, wrong for blue */
button.secondary { background: #fbce07; color: #1f2430; }

/* after — inherits color: #fff from the base button rule */
button.secondary { background: #0f62a8; }
```

The `color` line was **deleted** rather than set to `#fff`: the base rule
already supplies white, so restating it would be dead weight. The comment above
the rule was rewritten in the same pass — left as-is it would have described
yellow reasoning on a blue button and actively misled the next reader.

Changing the background and leaving `color: #1f2430` would have given
dark-on-dark at 2.46:1 on all six secondary buttons. That was the characteristic
failure mode of this change, and it was avoided.

### The knock-on effect on disabled secondaries

Deleting that `color` line has one consequence worth stating plainly, because it
is not visible in the diff. `button:disabled` sets only `background: #85c5a5`
and no `color`, so a *disabled secondary* button now inherits white too:

| | before | after |
| --- | --- | --- |
| disabled **primary** | white on `#85c5a5` — 1.99:1 | unchanged |
| disabled **secondary** | `#1f2430` on `#85c5a5` — 7.78:1 | white on `#85c5a5` — **1.99:1** |

This was accepted rather than patched, for three reasons: WCAG 1.4.3 explicitly
exempts inactive controls from the contrast minimum; 1.99:1 is already the
shipped, accepted treatment for every disabled *primary* button; and the two
disabled states are now uniform where before they silently disagreed. Making
disabled secondaries dark-text again would mean either a new
`button.secondary:disabled` rule that reintroduces that disagreement, or
changing disabled *primary* buttons too — a drive-by outside this change.

It is a real legibility drop in one state, so it is called out in the review
packet rather than buried. Recorded in `CLAUDE.md` under the `#85c5a5` rule.

## Changes made

**`src/index.css`** — one rule plus its comment:

- `:142-144` — comment rewritten for the blue accent, with the real ratios and
  an explicit "do not add a `color` here"
- `:145` — `background: #fbce07` → `#0f62a8`
- `:146` — `color: #1f2430` deleted

Deliberately untouched: `:96`/`:98`/`:136`/`:249` primary green, `:150`
`#85c5a5` disabled tint, `:28`/`:49`/`:167-168` success green, `:48`
`.toast.info` neutral.

**`src/components/Dashboard.tsx`**:

- `:106` — `<Bar dataKey="km" fill="#e8a100">` → `fill="#0f62a8"`

The other three charts stay green. The mapping green = cost/consumption,
accent = distance survives intact. No single chart mixes green and blue, so
there is no colorblind-adjacency issue.

**`CLAUDE.md`** — the palette line, the accent text-color rule (replaced, not
edited — it inverts), a note that the single blue is intentional and a chart
variant should not be reintroduced, a note that the `#85c5a5` tint is only valid
while the primary stays put, and a clause on why blue is not a candidate for the
`info` toast either.

## Verification

No automated check can catch a wrong color. `npm run build` proves the strings
are valid CSS/JSX; `npm test` cannot fail for a color reason. **Stage 5 (test
authoring) was skipped deliberately** — a test asserting a hex literal equals
itself tests the test, not the app.

Mechanical evidence: `grep -rn "#[0-9a-fA-F]\{3,6\}" src/` shows zero surviving
`#fbce07` or `#e8a100`, and all four `#008542` sites plus `#85c5a5` still
present. Build passes, tests pass, lint emits exactly the 4 known `App.tsx`
warnings.

Requires human eyes — the things a click-through misses:

1. Secondary-button legibility at all **six** call sites — Export
   (`Dashboard.tsx:67`), sync (`History.tsx:71`), Add vehicle
   (`Settings.tsx:136`), Refresh prices (`:185`), Disconnect (`:207`),
   Sync now (`:225`)
2. The disabled states, which a normal session never renders, now that they are
   white-on-`#85c5a5`: Export with zero fill-ups, sync button with sync off
3. All four charts **with data loaded** — an empty dataset draws bare axes and
   hides a missed chart color completely
4. All three toast variants — info (neutral), success (green), error (maroon)

## Out of scope

- **Primary, success green, error maroon** — unchanged. The maroon exists only
  to stay distinct from a *red* brand, a reason already moot; reverting it to a
  plain red is a separate decision.
- **Page background `#f7f6f3`** — a warm gray chosen for a red/yellow brand,
  arguably slightly off under green+blue. Near-neutral (247,246,243) so not
  wrong, and moving it means moving both `:8` and `:179` together or the stat
  tiles stop blending into the page.
- **`public/favicon.png`** — a solid blue square with a white glyph left over
  from the pre-Shell theme. Binary, no vector source in the repo. Becomes *less*
  wrong under a blue accent, but is still not the brand green.
- **Recharts axis/grid/tooltip chrome** — library-default neutrals; restyling
  means adding props that don't exist today.
- **The 4 known lint warnings in `App.tsx`.**
