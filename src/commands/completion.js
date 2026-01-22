const argv = process.argv.slice(2);
let shell = null;
let showHelp = false;

for (const arg of argv) {
  if (arg === "--help" || arg === "-h" || arg === "help") {
    showHelp = true;
    continue;
  }
  if (!shell && !arg.startsWith("-")) {
    shell = arg;
  }
}

function printHelp() {
  process.stdout.write(
    "Usage: ralph-codex completion <bash|zsh|fish>\n\n" +
      "Examples:\n" +
      "  ralph-codex completion bash\n" +
      "  ralph-codex completion zsh\n" +
      "  ralph-codex completion fish\n",
  );
}

if (showHelp || !shell) {
  printHelp();
  process.exit(showHelp ? 0 : 1);
}

function bashCompletion() {
  return `# ralph-codex completions for bash
_ralph_codex_codex_home() {
  if [[ -n "$CODEX_HOME" ]]; then
    printf "%s" "$CODEX_HOME"
  else
    printf "%s" "$HOME/.codex"
  fi
}

_ralph_codex_config_path() {
  if [[ -n "$RALPH_CONFIG" ]]; then
    printf "%s" "$RALPH_CONFIG"
  elif [[ -n "$RALPH_CONFIG_PATH" ]]; then
    printf "%s" "$RALPH_CONFIG_PATH"
  elif [[ -n "$RALPH_CODEX_CONFIG" ]]; then
    printf "%s" "$RALPH_CODEX_CONFIG"
  else
    printf "%s" "ralph.config.yml"
  fi
}

_ralph_codex_yaml_values() {
  local key="$1"
  local config="$(_ralph_codex_config_path)"
  if [[ -f "$config" ]]; then
    sed -nE "s/^[[:space:]]*$key[[:space:]]*:[[:space:]]*([^#]+).*/\\\\1/p" "$config" \\
      | sed -E "s/[\\\"']//g" \\
      | awk 'NF{gsub(/[[:space:]]+$/, "", $0); print}'
  fi
}

_ralph_codex_tasks_paths() {
  _ralph_codex_yaml_values "tasks_path"
}

_ralph_codex_completion_promises() {
  _ralph_codex_yaml_values "completion_promise"
}

_ralph_codex_profiles_raw() {
  local config="$(_ralph_codex_codex_home)/config.toml"
  if [[ -f "$config" ]]; then
    sed -nE 's/^\\[profiles\\.("?[^"]+"?|[^]]+)\\].*$/\\1/p' "$config" | sed -E 's/^"//; s/"$//'
  fi
}

_ralph_codex_models_raw() {
  local cache="$(_ralph_codex_codex_home)/models_cache.json"
  if [[ -f "$cache" ]]; then
    grep -oE '"slug"[[:space:]]*:[[:space:]]*"[^"]+"' "$cache" | sed -E 's/.*"([^"]+)"/\\1/'
  fi
}

_ralph_codex_unique_words() {
  awk '!seen[$0]++'
}

_ralph_codex_join_words() {
  tr '\\n' ' ' | sed 's/  */ /g'
}

_ralph_codex_model_list() {
  local static="gpt-5.2-codex gpt-5.1-codex-mini gpt-5.1-codex-max gpt-5.2 gpt-5.1 gpt-5.1-codex gpt-5-codex gpt-5-codex-mini gpt-5"
  local dynamic
  dynamic="$(_ralph_codex_models_raw)"
  if [[ -n "$dynamic" ]]; then
    { printf "%s\\n" $dynamic; printf "%s\\n" $static; } | _ralph_codex_unique_words | _ralph_codex_join_words
  else
    printf "%s" "$static"
  fi
}

_ralph_codex_profile_list() {
  local dynamic
  dynamic="$(_ralph_codex_profiles_raw)"
  if [[ -n "$dynamic" ]]; then
    printf "%s\\n" $dynamic | _ralph_codex_unique_words | _ralph_codex_join_words
  fi
}

_ralph_codex_tasks_list() {
  local dynamic
  dynamic="$(_ralph_codex_tasks_paths)"
  if [[ -n "$dynamic" ]]; then
    { printf "%s\\n" tasks.md; printf "%s\\n" $dynamic; } | _ralph_codex_unique_words | _ralph_codex_join_words
  else
    printf "%s" "tasks.md"
  fi
}

_ralph_codex_completion_promise_list() {
  local dynamic
  dynamic="$(_ralph_codex_completion_promises)"
  if [[ -n "$dynamic" ]]; then
    { printf "%s\\n" LOOP_COMPLETE; printf "%s\\n" $dynamic; } | _ralph_codex_unique_words | _ralph_codex_join_words
  else
    printf "%s" "LOOP_COMPLETE"
  fi
}

_ralph_codex() {
  local cur prev cmd
  cur="\\${COMP_WORDS[COMP_CWORD]}"
  prev="\\${COMP_WORDS[COMP_CWORD-1]}"
  cmd="\\${COMP_WORDS[1]}"

  local commands="init plan run revise refine view reset docker completion help"
  local root_opts="--help -h --version -v"

  if [[ $COMP_CWORD -eq 1 ]]; then
    if [[ "$cur" == -* ]]; then
      COMPREPLY=( $(compgen -W "$root_opts" -- "$cur") )
    else
      COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
    fi
    return 0
  fi

  case "$cmd" in
    init)
      case "$prev" in
        --config)
          local configs
          configs="$(_ralph_codex_config_path)"
          COMPREPLY=( $(compgen -W "$configs" -- "$cur") $(compgen -f -- "$cur") )
          return 0
          ;;
      esac
      local opts="--force --config --no-gitignore"
      COMPREPLY=( $(compgen -W "$opts" -- "$cur") )
      return 0
      ;;
    plan)
      case "$prev" in
        --config)
          local configs
          configs="$(_ralph_codex_config_path)"
          COMPREPLY=( $(compgen -W "$configs" -- "$cur") $(compgen -f -- "$cur") )
          return 0
          ;;
        --tasks|--output)
          local tasks
          tasks="$(_ralph_codex_tasks_list)"
          COMPREPLY=( $(compgen -W "$tasks" -- "$cur") $(compgen -f -- "$cur") )
          return 0
          ;;
        --sandbox)
          COMPREPLY=( $(compgen -W "read-only workspace-write danger-full-access" -- "$cur") )
          return 0
          ;;
        --ask-for-approval)
          COMPREPLY=( $(compgen -W "untrusted on-failure on-request never" -- "$cur") )
          return 0
          ;;
        --reasoning)
          COMPREPLY=( $(compgen -W "low medium high xhigh" -- "$cur") )
          return 0
          ;;
        --model|-m)
          local models
          models="$(_ralph_codex_model_list)"
          COMPREPLY=( $(compgen -W "$models" -- "$cur") )
          return 0
          ;;
        --profile|-p)
          local profiles
          profiles="$(_ralph_codex_profile_list)"
          COMPREPLY=( $(compgen -W "$profiles" -- "$cur") )
          return 0
          ;;
      esac
      local opts="--output --tasks --max-iterations --config --model -m --profile -p --sandbox --no-sandbox --ask-for-approval --full-auto --reasoning --detect-success-criteria --no-detect-success-criteria --help -h"
      COMPREPLY=( $(compgen -W "$opts" -- "$cur") )
      return 0
      ;;
    run)
      case "$prev" in
        --config)
          local configs
          configs="$(_ralph_codex_config_path)"
          COMPREPLY=( $(compgen -W "$configs" -- "$cur") $(compgen -f -- "$cur") )
          return 0
          ;;
        --tasks|--input)
          local tasks
          tasks="$(_ralph_codex_tasks_list)"
          COMPREPLY=( $(compgen -W "$tasks" -- "$cur") $(compgen -f -- "$cur") )
          return 0
          ;;
        --sandbox)
          COMPREPLY=( $(compgen -W "read-only workspace-write danger-full-access" -- "$cur") )
          return 0
          ;;
        --ask-for-approval)
          COMPREPLY=( $(compgen -W "untrusted on-failure on-request never" -- "$cur") )
          return 0
          ;;
        --reasoning)
          COMPREPLY=( $(compgen -W "low medium high xhigh" -- "$cur") )
          return 0
          ;;
        --model|-m)
          local models
          models="$(_ralph_codex_model_list)"
          COMPREPLY=( $(compgen -W "$models" -- "$cur") )
          return 0
          ;;
        --profile|-p)
          local profiles
          profiles="$(_ralph_codex_profile_list)"
          COMPREPLY=( $(compgen -W "$profiles" -- "$cur") )
          return 0
          ;;
        --completion-promise)
          local promises
          promises="$(_ralph_codex_completion_promise_list)"
          COMPREPLY=( $(compgen -W "$promises" -- "$cur") )
          return 0
          ;;
      esac
      local opts="--input --tasks --max-iterations --max-iteration-seconds --max-total-seconds --quiet -q --completion-promise --stop-on-error --no-log-stream --tail-log --tail-scratchpad --no-tail --config --model -m --profile -p --sandbox --no-sandbox --ask-for-approval --full-auto --reasoning --help -h"
      COMPREPLY=( $(compgen -W "$opts" -- "$cur") )
      return 0
      ;;
    revise|refine)
      case "$prev" in
        --config)
          local configs
          configs="$(_ralph_codex_config_path)"
          COMPREPLY=( $(compgen -W "$configs" -- "$cur") $(compgen -f -- "$cur") )
          return 0
          ;;
        --tasks)
          local tasks
          tasks="$(_ralph_codex_tasks_list)"
          COMPREPLY=( $(compgen -W "$tasks" -- "$cur") $(compgen -f -- "$cur") )
          return 0
          ;;
        --sandbox)
          COMPREPLY=( $(compgen -W "read-only workspace-write danger-full-access" -- "$cur") )
          return 0
          ;;
        --ask-for-approval)
          COMPREPLY=( $(compgen -W "untrusted on-failure on-request never" -- "$cur") )
          return 0
          ;;
        --reasoning)
          COMPREPLY=( $(compgen -W "low medium high xhigh" -- "$cur") )
          return 0
          ;;
        --model|-m)
          local models
          models="$(_ralph_codex_model_list)"
          COMPREPLY=( $(compgen -W "$models" -- "$cur") )
          return 0
          ;;
        --profile|-p)
          local profiles
          profiles="$(_ralph_codex_profile_list)"
          COMPREPLY=( $(compgen -W "$profiles" -- "$cur") )
          return 0
          ;;
      esac
      local opts="--tasks --config --model -m --profile -p --sandbox --no-sandbox --ask-for-approval --full-auto --reasoning --run --help -h"
      COMPREPLY=( $(compgen -W "$opts" -- "$cur") )
      return 0
      ;;
    view)
      case "$prev" in
        --tasks)
          local tasks
          tasks="$(_ralph_codex_tasks_list)"
          COMPREPLY=( $(compgen -W "$tasks" -- "$cur") $(compgen -f -- "$cur") )
          return 0
          ;;
        --config)
          local configs
          configs="$(_ralph_codex_config_path)"
          COMPREPLY=( $(compgen -W "$configs" -- "$cur") $(compgen -f -- "$cur") )
          return 0
          ;;
        --format)
          COMPREPLY=( $(compgen -W "table list json" -- "$cur") )
          return 0
          ;;
        --only)
          COMPREPLY=( $(compgen -W "pending blocked done" -- "$cur") )
          return 0
          ;;
      esac
      if [[ $COMP_CWORD -eq 2 && "$cur" != -* ]]; then
        COMPREPLY=( $(compgen -W "tasks criteria config" -- "$cur") )
        return 0
      fi
      local opts="--tasks --config --format --limit --only --watch -w --help -h"
      COMPREPLY=( $(compgen -W "$opts" -- "$cur") )
      return 0
      ;;
    reset)
      case "$prev" in
        --tasks)
          local tasks
          tasks="$(_ralph_codex_tasks_list)"
          COMPREPLY=( $(compgen -W "$tasks" -- "$cur") $(compgen -f -- "$cur") )
          return 0
          ;;
        --config)
          local configs
          configs="$(_ralph_codex_config_path)"
          COMPREPLY=( $(compgen -W "$configs" -- "$cur") $(compgen -f -- "$cur") )
          return 0
          ;;
      esac
      local opts="--tasks --config --help -h"
      COMPREPLY=( $(compgen -W "$opts" -- "$cur") )
      return 0
      ;;
    docker)
      case "$prev" in
        --config)
          local configs
          configs="$(_ralph_codex_config_path)"
          COMPREPLY=( $(compgen -W "$configs" -- "$cur") $(compgen -f -- "$cur") )
          return 0
          ;;
      esac
      local opts="--config"
      COMPREPLY=( $(compgen -W "$opts" -- "$cur") )
      return 0
      ;;
    completion)
      if [[ "$prev" == "completion" ]]; then
        if [[ "$cur" == -* ]]; then
          COMPREPLY=( $(compgen -W "--help -h" -- "$cur") )
        else
          COMPREPLY=( $(compgen -W "bash zsh fish" -- "$cur") )
        fi
        return 0
      fi
      local opts="bash zsh fish --help -h"
      COMPREPLY=( $(compgen -W "$opts" -- "$cur") )
      return 0
      ;;
  esac
}
complete -F _ralph_codex ralph-codex
`;
}

function zshCompletion() {
  return `#compdef ralph-codex

_ralph_codex_codex_home() {
  if [[ -n "$CODEX_HOME" ]]; then
    print -r -- "$CODEX_HOME"
  else
    print -r -- "$HOME/.codex"
  fi
}

_ralph_codex_config_path() {
  if [[ -n "$RALPH_CONFIG" ]]; then
    print -r -- "$RALPH_CONFIG"
  elif [[ -n "$RALPH_CONFIG_PATH" ]]; then
    print -r -- "$RALPH_CONFIG_PATH"
  elif [[ -n "$RALPH_CODEX_CONFIG" ]]; then
    print -r -- "$RALPH_CODEX_CONFIG"
  else
    print -r -- "ralph.config.yml"
  fi
}

_ralph_codex_yaml_values() {
  local key="$1"
  local config="$(_ralph_codex_config_path)"
  if [[ -f "$config" ]]; then
    sed -nE "s/^[[:space:]]*$key[[:space:]]*:[[:space:]]*([^#]+).*/\\\\1/p" "$config" \\
      | sed -E "s/[\\\"']//g" \\
      | awk 'NF{gsub(/[[:space:]]+$/, "", $0); print}'
  fi
}

_ralph_codex_models_raw() {
  local cache="$(_ralph_codex_codex_home)/models_cache.json"
  if [[ -f "$cache" ]]; then
    grep -oE '"slug"[[:space:]]*:[[:space:]]*"[^"]+"' "$cache" | sed -E 's/.*"([^"]+)"/\\1/'
  fi
}

_ralph_codex_profiles_raw() {
  local config="$(_ralph_codex_codex_home)/config.toml"
  if [[ -f "$config" ]]; then
    sed -nE 's/^\\[profiles\\.("?[^"]+"?|[^]]+)\\].*$/\\1/p' "$config" | sed -E 's/^"//; s/"$//'
  fi
}

_ralph_codex_models_list() {
  local -a static dynamic combined
  static=(gpt-5.2-codex gpt-5.1-codex-mini gpt-5.1-codex-max gpt-5.2 gpt-5.1 gpt-5.1-codex gpt-5-codex gpt-5-codex-mini gpt-5)
  dynamic=(\${(f)"$(_ralph_codex_models_raw)"})
  combined=($dynamic $static)
  print -l -- \${(u)combined}
}

_ralph_codex_profiles_list() {
  local -a dynamic
  dynamic=(\${(f)"$(_ralph_codex_profiles_raw)"})
  if (( \${#dynamic[@]} )); then
    print -l -- \${(u)dynamic}
  fi
}

_ralph_codex_tasks_list() {
  local -a values
  values=(tasks.md \${(f)"$(_ralph_codex_yaml_values tasks_path)"})
  print -l -- \${(u)values}
}

_ralph_codex_completion_promises_list() {
  local -a values
  values=(LOOP_COMPLETE \${(f)"$(_ralph_codex_yaml_values completion_promise)"})
  print -l -- \${(u)values}
}

_ralph_codex_models() {
  local -a values
  values=(\${(f)"$(_ralph_codex_models_list)"})
  _values 'model' $values
}

_ralph_codex_profiles() {
  local -a values
  values=(\${(f)"$(_ralph_codex_profiles_list)"})
  _values 'profile' $values
}

_ralph_codex_tasks() {
  local -a values
  values=(\${(f)"$(_ralph_codex_tasks_list)"})
  _alternative \\
    "values:tasks:_values 'tasks' $values" \\
    "files:files:_files"
}

_ralph_codex_configs() {
  local -a values
  values=(\${(f)"$(_ralph_codex_config_path)"})
  _alternative \\
    "values:config:_values 'config' $values" \\
    "files:files:_files"
}

_ralph_codex_completion_promises() {
  local -a values
  values=(\${(f)"$(_ralph_codex_completion_promises_list)"})
  _values 'completion' $values
}

_ralph_codex() {
  local -a commands
  commands=(
    'init:Create ralph.config.yml and update .gitignore'
    'plan:Generate tasks.md with one round of questions'
    'run:Execute the loop until completion'
    'revise:Add new tasks from feedback'
    'refine:Alias for revise'
    'view:Show tasks, criteria, or config summaries'
    'reset:Reset all tasks to [ ]'
    'docker:Pick a Docker base image via Codex'
    'completion:Print shell completion script'
    'help:Show help'
  )

  local state
  _arguments -C \\
    '(-h --help)'{-h,--help}'[Show help]' \\
    '(-v --version)'{-v,--version}'[Show version]' \\
    '1:command:->command' \\
    '*::arg:->args'

  case $state in
    command)
      _describe 'command' commands
      ;;
    args)
      case $words[2] in
        init)
          _arguments \\
            '--force[Overwrite existing config]' \\
            '--config[Path to ralph.config.yml]:file:_ralph_codex_configs' \\
            '--no-gitignore[Do not update .gitignore]' \\
            '*::args:'
          ;;
        plan)
          _arguments \\
            '--output[Write tasks to a custom file]:path:_ralph_codex_tasks' \\
            '--tasks[Write tasks to a custom file]:path:_ralph_codex_tasks' \\
            '--max-iterations[Max planning iterations]:number:' \\
            '--config[Path to ralph.config.yml]:file:_ralph_codex_configs' \\
            '(-m --model)'{-m,--model}'[Codex model]:model:_ralph_codex_models' \\
            '(-p --profile)'{-p,--profile}'[Codex CLI profile]:profile:_ralph_codex_profiles' \\
            '--sandbox[Sandbox mode]:mode:(read-only workspace-write danger-full-access)' \\
            '--no-sandbox[Use danger-full-access]' \\
            '--ask-for-approval[Approval policy]:mode:(untrusted on-failure on-request never)' \\
            '--full-auto[workspace-write + on-request]' \\
            '--reasoning[Reasoning effort]:effort:(low medium high xhigh)' \\
            '--detect-success-criteria[Add auto-detected checks]' \\
            '--no-detect-success-criteria[Disable auto-detect]' \\
            '(-h --help)'{-h,--help}'[Show help]' \\
            '*:idea:'
          ;;
        run)
          _arguments \\
            '--input[Read tasks from a custom file]:path:_ralph_codex_tasks' \\
            '--tasks[Read tasks from a custom file]:path:_ralph_codex_tasks' \\
            '--max-iterations[Max iterations]:number:' \\
            '--max-iteration-seconds[Soft per-iteration limit]:number:' \\
            '--max-total-seconds[Hard total limit]:number:' \\
            '(-q --quiet)'{-q,--quiet}'[Reduce output]' \\
            '--completion-promise[Completion token]:text:_ralph_codex_completion_promises' \\
            '--stop-on-error[Stop on first error]' \\
            '--no-log-stream[Disable log streaming]' \\
            '--tail-log[Stream .ralph/loop-log.md]' \\
            '--tail-scratchpad[Stream .ralph/summary.md]' \\
            '--no-tail[Disable log + scratchpad streaming]' \\
            '--config[Path to ralph.config.yml]:file:_ralph_codex_configs' \\
            '(-m --model)'{-m,--model}'[Codex model]:model:_ralph_codex_models' \\
            '(-p --profile)'{-p,--profile}'[Codex CLI profile]:profile:_ralph_codex_profiles' \\
            '--sandbox[Sandbox mode]:mode:(read-only workspace-write danger-full-access)' \\
            '--no-sandbox[Use danger-full-access]' \\
            '--ask-for-approval[Approval policy]:mode:(untrusted on-failure on-request never)' \\
            '--full-auto[workspace-write + on-request]' \\
            '--reasoning[Reasoning effort]:effort:(low medium high xhigh)' \\
            '(-h --help)'{-h,--help}'[Show help]' \\
            '*::args:'
          ;;
        revise|refine)
          _arguments \\
            '--tasks[Tasks file to update]:path:_ralph_codex_tasks' \\
            '--config[Path to ralph.config.yml]:file:_ralph_codex_configs' \\
            '(-m --model)'{-m,--model}'[Codex model]:model:_ralph_codex_models' \\
            '(-p --profile)'{-p,--profile}'[Codex CLI profile]:profile:_ralph_codex_profiles' \\
            '--sandbox[Sandbox mode]:mode:(read-only workspace-write danger-full-access)' \\
            '--no-sandbox[Use danger-full-access]' \\
            '--ask-for-approval[Approval policy]:mode:(untrusted on-failure on-request never)' \\
            '--full-auto[workspace-write + on-request]' \\
            '--reasoning[Reasoning effort]:effort:(low medium high xhigh)' \\
            '--run[Run after approving changes]' \\
            '(-h --help)'{-h,--help}'[Show help]' \\
            '*:feedback:'
          ;;
        view)
          _arguments \\
            '1::section:(tasks criteria config)' \\
            '--tasks[Tasks file (default: tasks.md)]:path:_ralph_codex_tasks' \\
            '--config[Config path]:file:_ralph_codex_configs' \\
            '--format[Output format]:format:(table list json)' \\
            '--limit[Limit task rows]:number:' \\
            '--only[Task filter]:filter:(pending blocked done)' \\
            '(-w --watch)'{-w,--watch}'[Watch for changes]' \\
            '(-h --help)'{-h,--help}'[Show help]' \\
            '*::args:'
          ;;
        reset)
          _arguments \\
            '--tasks[Tasks file to reset]:path:_ralph_codex_tasks' \\
            '--config[Path to ralph.config.yml]:file:_ralph_codex_configs' \\
            '(-h --help)'{-h,--help}'[Show help]' \\
            '*::args:'
          ;;
        docker)
          _arguments \\
            '--config[Path to ralph.config.yml]:file:_ralph_codex_configs' \\
            '*::args:'
          ;;
        completion)
          _arguments \\
            '1::shell:(bash zsh fish)' \\
            '(-h --help)'{-h,--help}'[Show help]' \\
            '*::args:'
          ;;
        help)
          _arguments '*::args:'
          ;;
      esac
      ;;
  esac
}

compdef _ralph_codex ralph-codex
`;
}

function fishCompletion() {
  return `# ralph-codex completions for fish
function __ralph_codex_home
  if set -q CODEX_HOME
    echo $CODEX_HOME
  else
    echo $HOME/.codex
  end
end

function __ralph_codex_config_path
  if set -q RALPH_CONFIG
    echo $RALPH_CONFIG
  else if set -q RALPH_CONFIG_PATH
    echo $RALPH_CONFIG_PATH
  else if set -q RALPH_CODEX_CONFIG
    echo $RALPH_CODEX_CONFIG
  else
    echo ralph.config.yml
  end
end

function __ralph_codex_yaml_values
  set -l key $argv[1]
  set -l config (__ralph_codex_config_path)
  if test -f "$config"
    command sed -nE "s/^[[:space:]]*$key[[:space:]]*:[[:space:]]*([^#]+).*/\\\\1/p" "$config" \\
      | command sed -E "s/[\\\"']//g" \\
      | command awk 'NF{gsub(/[[:space:]]+$/, ""); print}'
  end
end

function __ralph_codex_profiles_raw
  set -l config (__ralph_codex_home)/config.toml
  if test -f "$config"
    command sed -nE 's/^\\[profiles\\.("?[^"]+"?|[^]]+)\\].*$/\\1/p' "$config" | command sed -E 's/^"//; s/"$//'
  end
end

function __ralph_codex_models_raw
  set -l cache (__ralph_codex_home)/models_cache.json
  if test -f "$cache"
    command grep -oE '"slug"[[:space:]]*:[[:space:]]*"[^"]+"' "$cache" | command sed -E 's/.*"([^"]+)"/\\1/'
  end
end

function __ralph_codex_models
  set -l static gpt-5.2-codex gpt-5.1-codex-mini gpt-5.1-codex-max gpt-5.2 gpt-5.1 gpt-5.1-codex gpt-5-codex gpt-5-codex-mini gpt-5
  set -l dynamic (__ralph_codex_models_raw)
  set -l out
  for v in $dynamic $static
    if test -n "$v"
      if not contains -- $v $out
        set -a out $v
      end
    end
  end
  printf "%s\\n" $out
end

function __ralph_codex_profiles
  set -l dynamic (__ralph_codex_profiles_raw)
  set -l out
  for v in $dynamic
    if test -n "$v"
      if not contains -- $v $out
        set -a out $v
      end
    end
  end
  printf "%s\\n" $out
end

function __ralph_codex_tasks
  set -l values tasks.md (__ralph_codex_yaml_values tasks_path)
  set -l out
  for v in $values
    if test -n "$v"
      if not contains -- $v $out
        set -a out $v
      end
    end
  end
  printf "%s\\n" $out
  __fish_complete_path
end

function __ralph_codex_configs
  set -l values (__ralph_codex_config_path)
  set -l out
  for v in $values
    if test -n "$v"
      if not contains -- $v $out
        set -a out $v
      end
    end
  end
  printf "%s\\n" $out
  __fish_complete_path
end

function __ralph_codex_completion_promises
  set -l values LOOP_COMPLETE (__ralph_codex_yaml_values completion_promise)
  set -l out
  for v in $values
    if test -n "$v"
      if not contains -- $v $out
        set -a out $v
      end
    end
  end
  printf "%s\\n" $out
end

complete -c ralph-codex -n '__fish_use_subcommand' -f -a 'init plan run revise refine view reset docker completion help' -d 'Commands'
complete -c ralph-codex -n '__fish_use_subcommand' -s h -l help -d 'Show help'
complete -c ralph-codex -n '__fish_use_subcommand' -s v -l version -d 'Show version'

complete -c ralph-codex -n '__fish_seen_subcommand_from init' -l force -d 'Overwrite existing config'
complete -c ralph-codex -n '__fish_seen_subcommand_from init' -l config -r -a '(__ralph_codex_configs)' -d 'Path to ralph.config.yml'
complete -c ralph-codex -n '__fish_seen_subcommand_from init' -l no-gitignore -d 'Do not update .gitignore'

complete -c ralph-codex -n '__fish_seen_subcommand_from plan' -l output -r -a '(__ralph_codex_tasks)' -d 'Write tasks to a custom file'
complete -c ralph-codex -n '__fish_seen_subcommand_from plan' -l tasks -r -a '(__ralph_codex_tasks)' -d 'Write tasks to a custom file'
complete -c ralph-codex -n '__fish_seen_subcommand_from plan' -l max-iterations -r -d 'Max planning iterations'
complete -c ralph-codex -n '__fish_seen_subcommand_from plan' -l config -r -a '(__ralph_codex_configs)' -d 'Path to ralph.config.yml'
complete -c ralph-codex -n '__fish_seen_subcommand_from plan' -s m -l model -r -a '(__ralph_codex_models)' -d 'Codex model'
complete -c ralph-codex -n '__fish_seen_subcommand_from plan' -s p -l profile -r -a '(__ralph_codex_profiles)' -d 'Codex CLI profile'
complete -c ralph-codex -n '__fish_seen_subcommand_from plan' -l sandbox -r -a 'read-only workspace-write danger-full-access' -d 'Sandbox mode'
complete -c ralph-codex -n '__fish_seen_subcommand_from plan' -l no-sandbox -d 'Use danger-full-access'
complete -c ralph-codex -n '__fish_seen_subcommand_from plan' -l ask-for-approval -r -a 'untrusted on-failure on-request never' -d 'Approval policy'
complete -c ralph-codex -n '__fish_seen_subcommand_from plan' -l full-auto -d 'workspace-write + on-request'
complete -c ralph-codex -n '__fish_seen_subcommand_from plan' -l reasoning -r -a 'low medium high xhigh' -d 'Reasoning effort'
complete -c ralph-codex -n '__fish_seen_subcommand_from plan' -l detect-success-criteria -d 'Add auto-detected checks'
complete -c ralph-codex -n '__fish_seen_subcommand_from plan' -l no-detect-success-criteria -d 'Disable auto-detect'
complete -c ralph-codex -n '__fish_seen_subcommand_from plan' -s h -l help -d 'Show help'

complete -c ralph-codex -n '__fish_seen_subcommand_from run' -l input -r -a '(__ralph_codex_tasks)' -d 'Read tasks from a custom file'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -l tasks -r -a '(__ralph_codex_tasks)' -d 'Read tasks from a custom file'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -l max-iterations -r -d 'Max iterations'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -l max-iteration-seconds -r -d 'Soft per-iteration limit'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -l max-total-seconds -r -d 'Hard total limit'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -s q -l quiet -d 'Reduce output'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -l completion-promise -r -a '(__ralph_codex_completion_promises)' -d 'Completion token'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -l stop-on-error -d 'Stop on first error'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -l no-log-stream -d 'Disable log streaming'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -l tail-log -d 'Stream .ralph/loop-log.md'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -l tail-scratchpad -d 'Stream .ralph/summary.md'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -l no-tail -d 'Disable log + scratchpad streaming'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -l config -r -a '(__ralph_codex_configs)' -d 'Path to ralph.config.yml'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -s m -l model -r -a '(__ralph_codex_models)' -d 'Codex model'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -s p -l profile -r -a '(__ralph_codex_profiles)' -d 'Codex CLI profile'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -l sandbox -r -a 'read-only workspace-write danger-full-access' -d 'Sandbox mode'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -l no-sandbox -d 'Use danger-full-access'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -l ask-for-approval -r -a 'untrusted on-failure on-request never' -d 'Approval policy'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -l full-auto -d 'workspace-write + on-request'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -l reasoning -r -a 'low medium high xhigh' -d 'Reasoning effort'
complete -c ralph-codex -n '__fish_seen_subcommand_from run' -s h -l help -d 'Show help'

complete -c ralph-codex -n '__fish_seen_subcommand_from revise refine' -l tasks -r -a '(__ralph_codex_tasks)' -d 'Tasks file to update'
complete -c ralph-codex -n '__fish_seen_subcommand_from revise refine' -l config -r -a '(__ralph_codex_configs)' -d 'Path to ralph.config.yml'
complete -c ralph-codex -n '__fish_seen_subcommand_from revise refine' -s m -l model -r -a '(__ralph_codex_models)' -d 'Codex model'
complete -c ralph-codex -n '__fish_seen_subcommand_from revise refine' -s p -l profile -r -a '(__ralph_codex_profiles)' -d 'Codex CLI profile'
complete -c ralph-codex -n '__fish_seen_subcommand_from revise refine' -l sandbox -r -a 'read-only workspace-write danger-full-access' -d 'Sandbox mode'
complete -c ralph-codex -n '__fish_seen_subcommand_from revise refine' -l no-sandbox -d 'Use danger-full-access'
complete -c ralph-codex -n '__fish_seen_subcommand_from revise refine' -l ask-for-approval -r -a 'untrusted on-failure on-request never' -d 'Approval policy'
complete -c ralph-codex -n '__fish_seen_subcommand_from revise refine' -l full-auto -d 'workspace-write + on-request'
complete -c ralph-codex -n '__fish_seen_subcommand_from revise refine' -l reasoning -r -a 'low medium high xhigh' -d 'Reasoning effort'
complete -c ralph-codex -n '__fish_seen_subcommand_from revise refine' -l run -d 'Run after approving changes'
complete -c ralph-codex -n '__fish_seen_subcommand_from revise refine' -s h -l help -d 'Show help'

complete -c ralph-codex -n '__fish_seen_subcommand_from view; and __fish_is_nth_token 3' -f -a 'tasks criteria config' -d 'Section'
complete -c ralph-codex -n '__fish_seen_subcommand_from view' -l tasks -r -a '(__ralph_codex_tasks)' -d 'Tasks file'
complete -c ralph-codex -n '__fish_seen_subcommand_from view' -l config -r -a '(__ralph_codex_configs)' -d 'Config path'
complete -c ralph-codex -n '__fish_seen_subcommand_from view' -l format -r -a 'table list json' -d 'Output format'
complete -c ralph-codex -n '__fish_seen_subcommand_from view' -l limit -r -d 'Limit task rows'
complete -c ralph-codex -n '__fish_seen_subcommand_from view' -l only -r -a 'pending blocked done' -d 'Task filter'
complete -c ralph-codex -n '__fish_seen_subcommand_from view' -s w -l watch -d 'Watch for changes'
complete -c ralph-codex -n '__fish_seen_subcommand_from view' -s h -l help -d 'Show help'

complete -c ralph-codex -n '__fish_seen_subcommand_from reset' -l tasks -r -a '(__ralph_codex_tasks)' -d 'Tasks file to reset'
complete -c ralph-codex -n '__fish_seen_subcommand_from reset' -l config -r -a '(__ralph_codex_configs)' -d 'Path to ralph.config.yml'
complete -c ralph-codex -n '__fish_seen_subcommand_from reset' -s h -l help -d 'Show help'

complete -c ralph-codex -n '__fish_seen_subcommand_from docker' -l config -r -a '(__ralph_codex_configs)' -d 'Path to ralph.config.yml'

complete -c ralph-codex -n '__fish_seen_subcommand_from completion; and __fish_is_nth_token 3' -f -a 'bash zsh fish' -d 'Shell'
complete -c ralph-codex -n '__fish_seen_subcommand_from completion' -s h -l help -d 'Show help'
`;
}

let output = "";
switch (shell) {
  case "bash":
    output = bashCompletion();
    break;
  case "zsh":
    output = zshCompletion();
    break;
  case "fish":
    output = fishCompletion();
    break;
  default:
    console.error(`Unknown shell: ${shell}`);
    printHelp();
    process.exit(1);
}

process.stdout.write(output);
