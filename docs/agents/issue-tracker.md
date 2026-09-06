# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

**Vocabulary:** "ticket" and "issue" mean the same thing — one unit of work, one directory. There
is no level below it. Tickets are vertical slices, each demoable on its own; a ticket that seems
to need sub-tasks should have been split into two tickets.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- **Each ticket is a directory**, not a file: `.scratch/<feature-slug>/issues/<NN>-<slug>/`,
  numbered from `01` in dependency order (blockers first)
- Inside a ticket directory:
  - **`state.md`** — the ticket. Triage status (see `triage-labels.md` for the role strings),
    the branch, what to build, a `**Blocked by:**` line, and acceptance criteria — followed by
    working notes under `## Notes`. This is what a fresh agent reads cold.
  - **anything else** — research output, prototype notes, scratch files, scraps. Free-form.
    Reference them from `state.md` if they matter; leave them unreferenced if they're just
    working residue.
- The feature directory has its own **`.scratch/<feature-slug>/state.md`**: overall position,
  which tickets are startable, the dependency order, and open decisions that span tickets.

Keep every `state.md` a **snapshot, not an append log** — small enough to read at a glance.
History belongs in git, and detail belongs in its own file in the ticket directory.

Substantial findings get their **own file** in the ticket directory rather than being pasted into
`state.md`. The ticket body is the thing an implementing agent reads with no other context;
growing it with legwork spends the context budget the ticket's sizing exists to protect.

## When a skill says "publish to the issue tracker"

Create a new ticket directory under `.scratch/<feature-slug>/issues/` (creating parents if
needed), containing `state.md`.

## When a skill says "fetch the relevant ticket"

Read `state.md` in the referenced ticket directory. The user will normally pass the path or the
ticket number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** ticket directory per question.

- **Map**: `.scratch/<effort>/map.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `.scratch/<effort>/issues/<NN>-<slug>/`, numbered from `01`, with the question
  in `state.md`. A `Type:` line records the ticket type
  (`research`/`prototype`/`grilling`/`task`); the `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top of `state.md`. A ticket is unblocked when
  every ticket it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for tickets that are open, unblocked, and
  unclaimed; first by number wins.
- **Claim**: set `Status: claimed` in `state.md` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading in `state.md`, set
  `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far
  in `map.md`.
