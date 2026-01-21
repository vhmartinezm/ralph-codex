# ralph-codex

Codex-first Ralph-style planning and run loops.

## What it does

- Turns an idea into a task plan (`tasks.md`) with one round of questions.
- Runs the loop until completion, keeping state in `.ralph/`.
- Optional Docker mode for reproducible runs.
- Colorized Codex output in TTY for easier scanning (disable with `NO_COLOR=1`).

## Requirements

- Node.js >= 18
- Codex CLI installed and authenticated (`codex` available in PATH)
- Docker (optional, only for Docker mode)

## Install

```bash
npm install -g ralph-codex
# or
npx ralph-codex --help
```

## Quick start

```bash
ralph-codex init
ralph-codex plan "Add screenshot flow for /demo" --output tasks.md
ralph-codex run
ralph-codex reset
```

## Command reference

### init

Create `ralph.config.yml` and add `.ralph` to `.gitignore`.
Init is interactive and prompts for Codex settings and Docker usage.

```bash
ralph-codex init [--force] [--config <path>] [--no-gitignore]
```

### plan

Generate `tasks.md` with one round of questions.

```bash
ralph-codex plan "<idea>" [--output <path>] [--tasks <path>] [--max-iterations <n>]
```

Common options:

- `--output <path>` write tasks to a custom file (alias of `--tasks`).
- `--config <path>` use a custom config file.
- `--model <name>` or `-m` set the Codex model.
- `--profile <name>` or `-p` use a Codex CLI profile.
- `--sandbox <mode>` set sandbox mode.
- `--ask-for-approval <mode>` set approval policy.
- `--full-auto` use workspace-write + on-request.
- `--reasoning [effort]` override reasoning effort; omit value to pick from a list (defaults to medium).
- `--detect-success-criteria` add auto-detected checks to the success list.
- `--no-detect-success-criteria` disable auto-detect (overrides config).

### run

Execute the loop until completion.

```bash
ralph-codex run [--input <path>] [--tasks <path>] [--max-iterations <n>]
```

Useful options:

- `--input <path>` read tasks from a custom file (alias of `--tasks`).
- `--quiet` reduce output.
- `--completion-promise <text>` change the completion marker.
- `--stop-on-error` stop on the first error.
- `--no-tail` disable log/scratchpad tailing.
- `--reasoning [effort]` override reasoning effort; omit value to pick from a list (defaults to medium).

### reset

Reset all tasks in `tasks.md` to `[ ]`.
Uses `plan.tasks_path` or `run.tasks_path` when set, unless overridden.

```bash
ralph-codex reset [--tasks <path>] [--config <path>]
```

### docker

Ask Codex for a base image and update Docker config.

```bash
ralph-codex docker [--config <path>]
```

## Configuration

The CLI reads `ralph.config.yml` in the project root. Use `--config <path>` to point elsewhere.
Run `ralph-codex init` to generate the full config. Example of the most common fields:

```yaml
version: 1

codex:
  model: gpt-5-codex
  profile: default
  sandbox: workspace-write
  ask_for_approval: on-request
  model_reasoning_effort: medium # or null to use Codex default

docker:
  enabled: false
  use_for_plan: false
  base_image: node:20-bullseye
  codex_install: npm install -g @openai/codex

plan:
  auto_detect_success_criteria: false
  tasks_path: tasks.md

run:
  max_iterations: 15
```

Codex settings quick guide:
- `profile` selects a Codex CLI profile (default `null`, uses Codex default).
- `sandbox` sets permission mode (`read-only`, `workspace-write`, `danger-full-access`; default `null`).
- `ask_for_approval` controls prompt behavior (`untrusted`, `on-failure`, `on-request`, `never`; default `null`).
- `full_auto` is a convenience preset for `workspace-write` + `on-request` (default `false`).
- `model_reasoning_effort` chooses reasoning level (`low`, `medium`, `high`, `extra-high`; default `null`).

Enable `plan.auto_detect_success_criteria` to add detected checks based on repo files.

CLI flags always override config values.

## Docker mode

1. Run `ralph-codex docker` to pick a base image.
2. Set `docker.codex_install` so Codex is available inside the container.
3. Run `ralph-codex plan` and `ralph-codex run` as usual. Enable `docker.use_for_plan`
   if you want planning to happen inside Docker as well.

`Dockerfile.ralph` is generated automatically when Docker is enabled.

## Files created

- `ralph.config.yml` default config file.
- `tasks.md` planning output (configurable).
- `.ralph/` run state, summaries, and logs.

## Output styling

Codex output is colorized when stdout is a TTY. Set `NO_COLOR=1` to disable.

## Troubleshooting

- `codex: command not found` -> install Codex CLI and ensure it is in PATH.
- Docker errors -> start Docker Desktop/Colima and retry.
- Plan/run fail to read config -> verify `ralph.config.yml` path or pass `--config`.

## License

MIT
