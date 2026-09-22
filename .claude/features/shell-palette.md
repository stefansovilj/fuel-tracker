# Shell red + yellow palette

## Context

FuelTracker currently wears a blue/green palette (`#2b6cff` primary, `#17752f`
success) that has nothing to do with fuel. The request is to re-skin it in
Shell's red and yellow so the app reads as a fuel app at a glance, including
the dashboard charts.

This is a pure presentation change. It touches no logic, no types, no storage
and no network code, so none of the six project invariants are in play. The
risk is entirely *incompleteness*: the colors live in two places that no single
search covers, and a half-restyled app ships straight to production because
merging to master is releasing.

Two design decisions were settled with the user before planning:

- **Red is primary, yellow is the accent.** Red carries buttons, active nav and
  links with white text (4.9:1, passes AA). Yellow only ever appears under dark
  text (10.1:1) — white on Shell yellow is 1.5:1 and would be unreadable.
- **Errors move to a deep maroon.** With brand red on every primary surface, a
  bright red error toast stops signalling "something went wrong". Maroon keeps
  the red semantics while staying clearly distinct from the brand.

## Palette

| Role | Old | New |
| --- | --- | --- |
| Primary | `#2b6cff` blue | `#DD1D21` Shell red |
| Primary disabled tint | `#9db6f5` | `#ef9394` |
| Accent | — | `#FBCE07` Shell yellow (dark text only) |
| Chart accent | — | `#E8A100` deepened yellow |
| Error | `#a11` | `#7a0f12` deep maroon |
| Success | `#17752f` green | unchanged |
| Page background | `#f5f6f8` cool gray | `#f7f6f3` warm gray |
| Body text | `#1f2430` | unchanged |

Two notes on the derived values:

- `#ef9394` is `#DD1D21` mixed with white at the same ratio that produced
  `#9db6f5` from `#2b6cff`, so the disabled button keeps its current weight.
- The chart yellow is deepened from `#FBCE07` because pure Shell yellow is
  1.5:1 against a white chart background and the bars read as washed out.
  `#E8A100` is still unmistakably the brand yellow but holds its shape.

**Success green stays.** It is semantic (sync connected, saved successfully),
not brand chrome. Green carries real meaning in those three spots and no
red/yellow substitute does.

## Files to change

### `src/index.css`

Blue primary → Shell red, 5 sites: `.toast.info` (:48), `nav a.active`
background **and** border-color (:96, :98 — one rule, two properties), `button`
background (:136), `.link-button` color (:246).

`button:disabled` (:147) `#9db6f5` → `#ef9394`. **This is the highest-risk line
in the change** — it is a derived blue tint, so a find-and-replace on `#2b6cff`
misses it and leaves a pale blue disabled button on an otherwise red app.

`button.secondary` (:142-144) `#555` → `#FBCE07`, **plus a new
`color: #1f2430;` declaration** in that rule. This is where yellow actually
earns its place in the UI: `.secondary` is the Export button and the sync
buttons, so the app reads red *and* yellow rather than red with a yellow chart.
The added `color` is required — `.secondary` inherits `color: #fff` from
`button` (:135), and white on yellow is unreadable.

Error maroon, 2 sites: `.toast.error` (:50) and `.message.error` color (:160).
The `#fde2e2` tint background (:159) stays — it already reads as a red tint and
sits correctly under maroon text.

Page background `#f5f6f8` → `#f7f6f3` at **both** `body` (:8) and `.stat`
(:176). Same value in two rules; changing one without the other makes the stat
tiles stop blending into the page.

Untouched: all grays (`#666`, `#555`, `#ccc`, `#ddd`, `#eee`), body/nav text
`#1f2430`, white surfaces, and all three success-green sites.

### `src/components/Dashboard.tsx`

The four inline Recharts hexes, invisible to a CSS-only search:

| Line | Chart | Old | New |
| --- | --- | --- | --- |
| :80 | Consumption per fill-up (line) | `#2b6cff` | `#DD1D21` |
| :93 | Cost per month (bar) | `#2b6cff` | `#DD1D21` |
| :106 | Distance per year (bar) | `#2b6cff` | `#E8A100` |
| :119 | Cost per year (bar) | `#17752f` | `#DD1D21` |

Note :119 is the **green** one — a single-value replace of `#2b6cff` restyles
three charts and leaves the fourth green.

This mapping is deliberately not a straight swap. It makes cost consistently
red (:93 and :119, which today are inconsistently blue and green) and uses
yellow for the one distance chart, so the color distinguishes *cost from
distance* rather than *monthly from yearly*.

### `CLAUDE.md` (:77-78)

The "Current palette" line names the five old hexes by role and becomes wrong
the moment this lands. Update it to the new palette. The mandated grep command
on :80 stays valid as-is.

## Explicitly out of scope

- **`public/favicon.png`** — a solid blue square with a white glyph. It is
  binary, has no vector source in the repo, and stays blue after this change.
  This is a **conscious deferral, not an oversight**: regenerating it needs an
  image tool and a new asset, which is its own task. Flagged in the review packet.
- The 4 known `App.tsx` lint warnings. Not touched, per CLAUDE.md.
- Recharts `CartesianGrid` / axis / `Tooltip` chrome. These use library default
  neutrals with no hex in our code; restyling them means *adding*
  `contentStyle`/`stroke` props that do not exist today — new code, not a value swap.
- A `theme-color` meta tag in `index.html`. None exists today.
- Any refactor of `Dashboard.tsx` beyond the four `fill`/`stroke` strings.

## Verification

**Automated gates** — all three must run, but be honest about what they prove:

- `npm run build` — type gate. Catches a malformed string or broken JSX and
  **nothing** about whether a color is right.
- `npm test` — behavior gate. Cannot fail for a color reason; a no-op guard.
- `npm run lint` — must emit **exactly the 4 known `App.tsx` warnings**. Any
  other count means something out of scope was touched.
- `grep -rn "#[0-9a-fA-F]\{3,6\}" src/` — re-run and diff against the
  pre-change inventory to prove no blue or old-green literal survives.

**Manual visual sweep** — this is the only real gate. Both the type gate and the
behavior gate pass on a completely wrong palette. Required checks:

1. All four dashboard charts, **with data loaded** — an empty dataset draws
   empty axes and hides a missed color entirely.
2. Both disabled-button states, which a normal click-through never renders:
   Export with no fill-ups (`Dashboard.tsx:67`) and the sync button with sync
   off (`History.tsx:71`).
3. All three toast variants — `info`, `success`, `error` are separate rules and
   one session may only ever show one of them.
4. Yellow secondary buttons — confirm dark text actually applied and nothing
   renders white-on-yellow.
5. Every view: form, history, dashboard, settings.

## Risk

The failure mode is a half-restyled app — blue disabled button, one green
chart, cool-gray stat tiles — and there is no staging environment, so it would
ship live. `index.css` and `Dashboard.tsx` must be edited in the same pass.
