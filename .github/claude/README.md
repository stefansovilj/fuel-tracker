# GitHub issue → Claude → pull request

One workflow, [`claude-agent.yml`](../workflows/claude-agent.yml), that turns a
labelled issue into a reviewed branch.

```
GitHub issue                 claude-agent.yml
────────────                 ────────────────
collaborator adds       →    checkout, install
the `agent` label            gh issue view → prompt
                             claude -p "/feature"
                             push claude/issue-N, open PR
                             comment on the issue, relabel
```

## There is no scheduler here

Most ticket systems cannot start a build when a ticket changes, so this pattern
usually needs a second pipeline polling for work every few minutes — plus a way
to claim an item so two runs don't pick up the same one. GitHub needs none of
that: `on: issues: types: [labeled]` is a native trigger. One workflow, one real
event behind it.

If you ever do want a sweeper — to catch issues labelled while Actions was down
— add a schedule to the same workflow and query with
`gh issue list --label agent --json number`. You almost certainly don't need it.

## What runs Claude

One step, *Run the agent*:

```bash
claude -p "/feature Build the feature described on stdin." \
  --permission-mode auto --permission-prompts none \
  --output-format json --json-schema "$SCHEMA" \
  < request.md > result.json
```

There is no service to call and nothing to host. Claude Code is a CLI binary
installed on the runner, and prompting it is passing a string. That single
process reads `CLAUDE.md`, `.claude/settings.json`, the `/feature` skill and the
four subagents out of the checkout, then orchestrates the whole pipeline
internally — `feature-analyst`, then implementation, then `test-author` and
`visual-verifier`, then `change-verifier`. The job blocks until it exits.

Two details in that command are load-bearing:

- **`--permission-prompts none`** is what makes the run unattended. Without it,
  anything that would prompt waits forever for a host that does not exist. With
  it, `AskUserQuestion` is removed from the tool set entirely, so the agent
  cannot stop to ask. Requires Claude Code **v2.1.259 or later** — the workflow
  installs `@latest` for this reason.
- **The prompt string is a fixed literal; the issue text arrives on stdin.**
  Interpolating a body that anyone on the internet can write into a shell
  command line is how you hand a stranger's backticks to bash.

## The label is the authorization gate

Anyone can open an issue on a public repo. Only accounts with **triage or write
access can apply a label**. That asymmetry is the entire security model here:
the workflow ignores every event except `label.name == 'agent'`, so a run only
starts when someone you trust decides this issue is worth spending an agent on.

The body is still untrusted text going into a model that can edit files, so the
usual containment applies and is already in place:

- The agent cannot push. `autoMode.hard_deny` in `.claude/settings.json` blocks
  `git push` in any form, and it is enforced in CI exactly as it is locally.
- The workflow pushes a **branch**, never `master`. A human merges.
- `GITHUB_TOKEN` is scoped to `contents`, `pull-requests` and `issues` on this
  repo only.

Do not relax the label guard to `on: issues: types: [opened]`. That would let
anyone with a GitHub account start a paid agent run on your repo.

## Setup

**1. Secret.** A runner is a fresh VM with no `~/.claude`, so the credential has
to arrive as an environment variable. This repo authenticates with a **Claude
subscription**, not API billing:

```bash
claude setup-token      # run locally, copy the token it prints
```

Settings → Secrets and variables → Actions → New repository secret, named
exactly `CLAUDE_CODE_OAUTH_TOKEN`. The workflow checks for it in its first step
and fails immediately with a readable message if it is missing.

`GITHUB_TOKEN` is provided automatically; nothing to add.

To move onto pay-as-you-go API billing instead, create a key at
[platform.claude.com](https://platform.claude.com), store it as
`ANTHROPIC_API_KEY`, and change the two `env:` blocks in the workflow that name
the token. Do that before sharing this repo with anyone: an OAuth token is tied
to the subscription of whoever ran `setup-token` and breaks when that plan
changes.

**2. Workflow permissions.** Settings → Actions → General → Workflow
permissions: select **Read and write permissions** and tick **Allow GitHub
Actions to create and approve pull requests**. Without the second one
`gh pr create` fails with a 403 that reads like an auth problem but isn't.

**3. Label.** Create a label named `agent`. The three outcome labels
(`agent:done`, `agent:needs-split`, `agent:blocked`) are created by the workflow
on first use.

**4. Merge to master.** The `issues` event always runs the workflow file from
the **default branch**, so nothing fires until this is on `master`. Note that
pushing it also triggers [`deploy.yml`](../workflows/deploy.yml) — a rebuild and
redeploy of identical content, harmless but not silent.

## Running it the first time

Use the manual path before you label anything: Actions → Claude agent → Run
workflow, give it an issue number, leave **dry_run** ticked (it defaults on).
The agent runs end to end and uploads its result and screenshots as artifacts,
but pushes nothing and opens no PR. The `labeled` path is always live.

## What the workflow does with the verdict

`--json-schema` makes the run return
[`feature-result.schema.json`](feature-result.schema.json) in
`result.structured_output`, so the handback steps branch on data rather than on
prose. `result.result` still carries the full human-readable review packet,
which is what goes into the issue comment and the PR body.

**Every run that changed a file gets a branch and a PR**, whatever the verdict.
A runner is destroyed when the job ends, so an edit that isn't pushed is gone —
and a blocked attempt is usually worth reading rather than re-running from
scratch. The verdict decides how the PR is *presented*, not whether it exists:

| `status` | Pull request | Issue ends up |
| --- | --- | --- |
| `completed` | ready for review, `Closes #N` | `agent:done` |
| `too-large` | **draft**, `[too-large]` subject, `Refs #N` | `agent:needs-split` |
| `blocked` | **draft**, `[blocked]` subject, `Refs #N` | `agent:blocked` |

The only run that produces no PR is one that changed no files (or a dry run);
the issue comment says so explicitly.

Branches are `feature/agent_<issue>`, one per issue, force-pushed on each run.
Re-labelling an issue therefore updates the existing branch and PR rather than
opening a second one, and the new review packet arrives as a PR comment.

A draft PR cannot be merged by reflex, which is the point: the human decides
what lands, and nothing in this workflow can reach `master`.

`too-large` is not a failure. Stage 2 of the skill refuses to start a large
change in one pass; the useful output is the split, and a human picks a slice
and re-labels.

The `agent` label is removed on the way out, so an issue cannot re-fire on its
own. Re-adding it is how you retry.

## Things that will bite

- **A PR opened with `GITHUB_TOKEN` does not trigger other workflows.** GitHub
  suppresses this deliberately, to stop workflows triggering each other in a
  loop. It costs you nothing today — you have no `pull_request` workflow — but
  the day you add CI on PRs, the agent's PRs will silently skip it. The fix then
  is a PAT or a GitHub App token, not a workflow change.
- **`visual-verifier` needs a real browser.** The *Prepare the browser harness*
  step installs `playwright-core` into `$RUNNER_TEMP` — outside the repo,
  because anything written inside the tree would land in the commit — and points
  `CHROME_EXE` at the runner's preinstalled Chrome. Without this the visual gate
  fails for an environmental reason that reads like a real failure.
- **Stage 0 refuses a dirty tree.** Do not add steps that write into the working
  directory before the agent runs. `$RUNNER_TEMP` for everything else is what
  keeps this true.
- **Claude does not commit, and must not report that as a failure.** Stage 8 of
  the skill requires explicit human go-ahead to commit or push, and with
  `--permission-prompts none` it cannot ask for one — so it never will. The
  workflow commits its working tree in a plain script step. The prompt and the
  schema both say this in as many words, because the first live run reported
  `blocked` with every gate green purely because it had not committed.
- **Merging the PR is releasing.** `deploy.yml` fires on push to `master` and
  publishes to Pages. There is no staging. Nothing in this workflow can reach
  master on its own; the merge button is the gate.
- **Cost.** With subscription auth there is no per-run bill, so the run is capped
  by `--max-turns 80` and the job's `timeout-minutes: 75` rather than by a dollar
  figure, and `concurrency` holds it to one run per issue. Runs still draw on
  your plan's usage limits — a long agent run is a large chunk of one. GitHub
  Actions minutes are billed separately by GitHub and are free on public repos.

## Adding a human gate mid-run

If you want approval between implementation and PR rather than at PR review,
split the job in two around a GitHub Environment with a required reviewer, and
have the second job continue the same conversation:

```bash
claude -p "Open the PR now." --resume "$SESSION_ID" --permission-mode auto
```

`session_id` is already captured by the *Read the verdict* step for this. Resume
rather than a fresh invocation — a cold process would re-read the codebase to
rebuild the context the first one already had, and you would pay for it twice.
