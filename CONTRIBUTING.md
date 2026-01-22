# Contributing

Thanks for improving ralph-codex! This CLI is designed to be deterministic and offline-friendly,
so tests should stay fast and independent of network or external services.

## Prerequisites

- Node.js >= 18
- npm (see `packageManager` in `package.json`)

## Install

```sh
npm install
```

## Run tests

```sh
npm test
```

Watch mode:

```sh
npm run test:watch
```

## Test harness overview

- `tests/helpers/cli.js` creates an isolated workspace + HOME per test.
- `tests/fixtures/bin/codex` and `tests/fixtures/bin/docker` are stubs injected into `PATH`.
- CLI calls to `codex`/`docker` are redirected to these stubs during tests.

### Stub controls

The codex stub supports a few env overrides to customize behavior:

- `CODEX_STUB_TASKS`: custom tasks.md content for plan/revise flows.
- `CODEX_STUB_APPEND_TASK=1`: append a dummy task in revise flows.
- `CODEX_STUB_BASE_IMAGE`: base image string for `ralph-codex docker`.
- `RALPH_TEST_MODE=1`: bypass interactive prompts in init/plan/docker.

## Writing new tests

- Use `createSandbox()` from `tests/helpers/cli.js` to isolate filesystem state.
- Keep tests deterministic: no network, no real `codex`, no real `docker`.
- Avoid interactive prompts. Favor non-interactive paths or add harness utilities first.
- Assert on stable output (no ANSI colors; tests set `NO_COLOR=1`).

## Future work (documented, not required for initial contributions)

- CI matrix: Node 18/20/22 with `npm ci` + `vitest run`.
- Coverage reports with `@vitest/coverage-v8` and thresholds.
- E2E smoke tests using a real `codex` binary behind opt-in env flags.
- Interaction tests for `plan`, `init`, and `docker` prompts (pseudo-TTY harness).
