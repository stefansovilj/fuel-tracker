---
name: feature
description: Run a feature request through FuelTracker's full pipeline — analyze, plan, implement, test, verify — and hand the human a review packet. Use when the user describes a change they want built ("add X", "change Y", "fix Z"), not for questions or exploration.
---

# Feature pipeline

Takes a feature request from one sentence to a verified, reviewable change.
The human writes the task and reviews the result; the stages in between are
automated.

**You are the orchestrator.** You run the stages, hold the thread, and own the
final summary. Delegate to subagents where the table says to — and do the
implementation yourself, because it needs sustained context that a subagent
cannot carry back.

## Stage 0 — Preflight

Refuse to start on a dirty tree. Run `git status`. If there are uncommitted
changes, stop and tell the user to commit or stash — a clean tree is what makes
this whole pipeline undoable.

Restate the request in one sentence and say which route you are taking.

## Stage 1 — Analyze

Delegate to **`feature-analyst`** (read-only). Pass the request verbatim.

Relay its size verdict and anything under **Unknowns** to the user before
continuing.

**Resolve the Unknowns yourself. Do not stop to ask.** For each one, pick what a
careful colleague would pick, and record it in the Stage 3 plan as an explicit
assumption with one line of reasoning. Plan approval is the gate that catches a
wrong call — correcting an assumption there costs the user a sentence, which is
why it does not need its own question first.

Ask only when proceeding under *any* assumption would be unsafe, or would make
the work useless if the guess is wrong. The existence of a choice is not a
reason to ask; an unrecoverable consequence is.

## Stage 2 — Route

| Size | Route |
| --- | --- |
| trivial | Skip Stage 3's written plan. Implement, verify, review. |
| small / medium | Full pipeline. |
| large | **Stop.** Present the analyst's split proposal and ask the user which slice to build. Do not start a large change in one pass. |

Scaling down for trivial work is the point, not a shortcut. A one-line CSS
change does not need a written plan and cannot have a unit test. Saying so is
correct behavior.

## Stage 3 — Plan

Write the plan to `.claude/features/<slug>.md`: the files to change, the
approach, the verification strategy, and what is explicitly out of scope.

Use plan mode for anything above trivial so the user approves the approach
before code exists. Correcting a plan costs a sentence; correcting a diff
costs a review.

## Stage 4 — Implement

**Do this yourself. Do not delegate.** Implementation is iterative and
context-heavy; a subagent would discard exactly the context you need for the
stages that follow.

Work to the plan. If you discover the plan was wrong, stop and say so rather
than quietly building something else. Stay in scope: no drive-by refactors,
no fixing the four known lint warnings.

## Stage 5 — Test

Two agents, chosen by what the change actually touches. Run both when it
touches both. Never skip the stage entirely without naming which one you
considered and why it did not apply.

**`test-author`** — for anything the analyst marked *unit-testable*: the pure
logic in `src/lib/`.

Do not manufacture a unit test to make the pipeline look complete. A test
asserting that a hex string equals itself is worse than no test.

**`visual-verifier`** — for anything that renders: `src/index.css`, the inline
Recharts props in `Dashboard.tsx`, component markup, layout. It drives the app
in a real browser, reads computed colors and contrast off the live DOM, and
screenshots every view with data seeded.

"Visual/manual only" is **not** a reason to skip this stage — it is the reason
this agent exists. Most of what looks unverifiable in a UI change is in fact
machine-checkable once something renders it: computed colors, contrast ratios,
whether two CSS rules resolve to the same value. Delegate that, and hand the
human only the genuine judgment calls.

What it cannot do is tell you whether a color is the *right* color. Keep those
two things clearly separated in the review packet.

## Stage 6 — Verify

Delegate to **`change-verifier`** (cannot edit; runs the gates with fresh eyes).

On **REJECT**: fix the findings yourself, then re-run the verifier. After two
failed rounds, stop and escalate to the user with what is blocking — do not
loop indefinitely.

## Stage 7 — Review packet

Present to the user, in this order:

1. **What changed** — one paragraph, plain language.
2. **Gates** — build / test / lint, with real numbers. For a UI change, add
   `visual-verifier`'s computed-style table and its verdict; those are gates
   too, and they are the only ones that can fail for a color reason.
3. **Diff summary** — `git diff --stat`, then walk the substantive hunks.
4. **Needs your eyes** — from the verifier, narrowed by what `visual-verifier`
   already settled. Do not hand over a check a machine has done: if the
   contrast is measured and the screenshots are attached, what remains is
   taste and coverage gaps. Say which is which, and offer to start
   `npm run dev` for anything still open.
5. **Proposed commit message.**

Then **stop and wait.**

## Stage 8 — Deploy (human-gated)

> Pushing to `master` deploys to production. There is no staging.

Never commit or push without the user's explicit go-ahead in this session.
"Looks good" on the review packet is approval to commit; pushing needs its own
yes. When given it:

```
git add -A && git commit && git push origin master
gh run watch          # follow the Pages deploy
```

Report the deploy result and the live URL. If the Action fails, say so with
the log — never report a deploy you did not see succeed.

## The rule behind all of this

Every stage either produces evidence or produces a gate. A stage that produces
neither is ceremony — cut it. If you find yourself writing "looks correct"
without output to back it, you have skipped a gate.
