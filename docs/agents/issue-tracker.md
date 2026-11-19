# Issue tracker: local Markdown

Specs and tickets live in `.scratch/` and are versioned with the repository.

## Conventions

- Use one directory per feature: `.scratch/<feature-slug>/`.
- Write the spec in `.scratch/<feature-slug>/spec.md`.
- Write each implementation ticket in `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`.
- Record triage state in a `Status:` line near the top of each ticket. Use the roles in [triage-labels.md](triage-labels.md).
- Append comments and conversation history under `## Comments` in the owning file.
- Keep acceptance criteria, plan changes, evidence, and progress in the owning ticket. Headquarters holds session memory and handoffs.

## Skill operations

When a skill says "publish to the issue tracker," create the corresponding local spec or ticket file using these conventions.

When a skill says "fetch the relevant ticket," read the referenced file. Resolve a bare ticket number within its feature directory.

## Wayfinding operations

For `/wayfinder`, use `.scratch/<effort>/map.md` for Notes, Decisions-so-far, and Fog. Use one child file per ticket under `.scratch/<effort>/issues/NN-<slug>.md`.

- Record `Type: research`, `prototype`, `grilling`, or `task` near the top of each child ticket.
- Record dependencies as `Blocked by: NN, NN`. A dependency is satisfied when its ticket has `Status: resolved`.
- Select the lowest-numbered open, unblocked, unclaimed ticket as the frontier.
- Claim work by saving `Status: claimed` before starting.
- Resolve work by appending `## Answer`, setting `Status: resolved`, and linking the answer from Decisions-so-far in the map.

Wayfinding uses its own `open`, `claimed`, and `resolved` lifecycle. Triage roles apply when a triage skill handles the work.
