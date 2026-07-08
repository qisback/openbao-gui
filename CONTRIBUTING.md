# Contributing

## Workflow

- Every change is a **branch → PR → merge** into `main`. No direct commits to `main`.
- Commit messages explain *what* and *why*, in full — the history is the record.
- A change must build clean (`npm run build`, which type-checks) before it is
  committed.
- Code and its documentation are ideally written in **separate sessions**: comment
  the code well enough that the docs can be written later from the code and history
  alone.

## Before you start

Read the [architecture](docs/architecture.md) and [development](docs/development.md)
guides. Keep the dependency surface small — new runtime dependencies need a good
reason.

## Style

- TypeScript strict mode; no unused locals/parameters (the build enforces this).
- Function components + hooks. Server state in React Query, not `useState`.
- Styling via the classes in `src/index.css`; don't introduce a CSS framework.
- Keep the UI **permission-aware**: read-only panels should degrade on `403`/`404`
  rather than error.

## Scope

See the roadmap in [docs/features.md](docs/features.md#not-yet-covered-roadmap) for
what is intentionally not built yet. New engine UIs, mount management, and the
plugin system are welcome targets.
