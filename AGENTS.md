# AGENTS

## Project Overview

- Repository: `PCB Scene3D Viewer` JavaScript library.
- Source is in `src/`.
- Tests are in `tests/`.
- Specifications are in `spec/`.
- Documentation is in `docs/`.
- The package contains reusable Three.js PCB 3D rendering utilities for
  normalized scene descriptions.

## Build, Run, Test

- Install: `npm install`
- Test: `npm test`
- Format: `npm run format`
- Check formatting: `npm run check:format`

## Coding Style & Naming Conventions

- Prettier settings are in `.prettierrc.json`: 4-space indent, single quotes,
  no semicolons, no trailing commas.
- Keep files under 1000 lines; split modules/classes when they grow.
- Keep each CSS file under 1000 lines.
- Add JSDoc for every function/method, including private helpers.
- Add inline comments only where non-obvious behavior needs context.
- Utility modules should use class-based organization with static methods when
  appropriate.
- For single-class modules, name the `.mjs` file in CamelCase to match the
  class name.
- For private internals, use ECMAScript private elements.
- Prefer `async/await` for naturally asynchronous operations.

## Library Scope

- Include browser-side Three.js scene runtime, geometry factories, STEP/WRL
  model loading, component picking, view presets, archive export, the optional
  DOM controller, and the optional 3D shell renderer/styles.
- Do not include ECAD parser logic or format-specific scene-description
  builders. Altium and KiCad scene descriptions are produced by their own
  toolkits and passed into this package.
- Keep renderer fixes universal. Never special-case a specific file name,
  project identifier, fixture helper, or source-derived phrase.

## Testing Guidelines

- Use repo scripts only: `npm test`.
- For every feature/fix/behavior change, add or update tests in `tests/`.
- Keep tests focused on observable renderer, runtime, geometry, and controller
  behavior.
- Tests must use repo-owned fake PCB samples only; never depend on or mention
  real customer, vendor, or project identifiers.

## Commit & Pull Request Guidelines

- Commit messages start with a prefix like `fix:`, `feature:`, or `chore:`
  plus a short imperative summary.
- Keep pull request summaries concise and include test results.

## Security & Configuration Tips

- Keep secrets out of Git.
- Treat scene descriptions, model payloads, and session files as untrusted
  input.
- Prefer local-first defaults and document any outbound network behavior
  explicitly.
