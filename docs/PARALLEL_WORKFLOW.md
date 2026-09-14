# BETCCO Parallel Workstream Workflow

BETCCO supports a maximum of two simultaneous implementation workstreams when their scopes are sufficiently independent. GitHub `main` remains the technical Source of Truth, while OPEN Draft Pull Requests provide live coordination state.

## Operating Model

```text
GitHub main
    |
    +--- Workstream A branch
    |       |
    |       +--- Draft PR A
    |
    +--- Workstream B branch
            |
            +--- Draft PR B
```

## Rules

- Maximum two simultaneous implementation workstreams.
- Use separate computers or clones and separate working directories.
- Use one dedicated branch per workstream.
- Keep workstreams in separate modules/files where practical.
- Open a Draft PR as soon as meaningful work is pushed.
- Use the PR body as the live progress ledger.
- Before coding, inspect every OPEN Draft PR and its Reserved Scope / Primary Files.
- Do not push directly to `main`.
- Do not force-push.
- Do not edit another workstream's branch or working directory.
- Do not concurrently modify the same reserved files/modules.
- After another workstream merges, fetch and inspect `origin/main`, then merge it into the current feature branch when needed.
- Conflicts require deliberate review; never automatically choose ours/theirs.
- Preserve one scoped feature or gap per branch.

## Workstream Requirements

Every active workstream must have:

- a dedicated branch
- a clearly defined owner/account
- a scoped module or feature
- an OPEN Draft PR
- a PR description containing current progress and reserved scope

No second workstream may be marked ACTIVE without a selected scope, owner, branch, and Draft PR.

## Standard Draft PR Body Template

```markdown
## Workstream

## Owner

## Status

## Purpose

## Current Progress

## Primary Files / Modules

## Reserved Scope

## Do Not Touch

## Dependencies

## Last Completed Checkpoint

## Next Step

## Blockers

## Definition of Done
```

## Status Values

- `READY` — scoped and owned, but implementation has not started.
- `IN PROGRESS` — implementation is underway.
- `BLOCKED` — progress cannot continue until a documented dependency or decision changes.
- `READY FOR REVIEW` — implementation and targeted validation are complete; review remains.
- `MERGED` — the PR is merged into `main` and project status has been reconciled.

## PROJECT_STATUS Boundary

`docs/PROJECT_STATUS.md` is a repository-level snapshot of merged state, active workstreams, roadmap state, and blockers. It is not a per-commit activity log. Avoid having both workstream branches continuously edit it; reconcile it through a small dedicated status/governance update after a product merge or another explicitly coordinated method.
