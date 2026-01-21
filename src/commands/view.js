import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { colors } from "../ui/terminal.js";

const root = process.cwd();
const argv = process.argv.slice(2);

const sections = new Set(["tasks", "criteria", "config"]);
let section = null;
let argIndex = 0;

if (argv[0] && !argv[0].startsWith("-") && sections.has(argv[0])) {
  section = argv[0];
  argIndex = 1;
} else if (argv[0] && !argv[0].startsWith("-") && argv[0] !== "help") {
  process.stderr.write(`Unknown section: ${argv[0]}\n`);
  process.stderr.write('Run "ralph-codex view --help" for usage.\n');
  process.exit(1);
}

let tasksPath = "tasks.md";
let configPath = null;
let format = "table";
let limit = 0;
let only = null;
let watch = false;
let showHelp = false;

for (let i = argIndex; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--help" || arg === "-h" || arg === "help") {
    showHelp = true;
    continue;
  }
  if (arg === "--tasks") {
    tasksPath = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--config") {
    configPath = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--format") {
    format = (argv[i + 1] || format).toLowerCase();
    i += 1;
    continue;
  }
  if (arg === "--limit") {
    const value = Number(argv[i + 1] || 0);
    limit = Number.isFinite(value) ? Math.max(0, value) : limit;
    i += 1;
    continue;
  }
  if (arg === "--only") {
    only = (argv[i + 1] || "").toLowerCase() || null;
    i += 1;
    continue;
  }
  if (arg === "--watch" || arg === "-w") {
    watch = true;
    continue;
  }
}

function printHelp() {
  process.stdout.write(
    `\n${colors.cyan("ralph-codex view [section] [options]")}\n\n` +
      `${colors.yellow("Sections:")}\n` +
      `  ${colors.green("tasks")}        Task list status\n` +
      `  ${colors.green("criteria")}     Success criteria from tasks.md\n` +
      `  ${colors.green("config")}       Effective config values\n\n` +
      `${colors.yellow("Options:")}\n` +
      `  ${colors.green("--tasks <path>")}           Tasks file (default: tasks.md)\n` +
      `  ${colors.green("--config <path>")}          Config path (default: ralph.config.yml)\n` +
      `  ${colors.green("--format <format>")}        table | list | json (default: table)\n` +
      `  ${colors.green("--limit <n>")}              Limit task rows (0 = no limit)\n` +
      `  ${colors.green("--only <filter>")}          pending | blocked | done (tasks only)\n` +
      `  ${colors.green("--watch, -w")}              Watch for changes and refresh\n` +
      `  ${colors.green("-h, --help")}               Show help\n\n` +
      `${colors.yellow("Examples:")}\n` +
      `  ralph-codex view\n` +
      `  ralph-codex view tasks --only pending\n` +
      `  ralph-codex view criteria --format list\n` +
      `  ralph-codex view config --format json\n\n`
  );
}

if (showHelp) {
  printHelp();
  process.exit(0);
}

const allowedFormats = new Set(["table", "list", "json"]);
if (!allowedFormats.has(format)) {
  console.error(`Invalid format: ${format}`);
  console.error("Use --format table|list|json.");
  process.exit(1);
}

const allowedFilters = new Set(["pending", "blocked", "done"]);
if (only && !allowedFilters.has(only)) {
  console.error(`Invalid --only filter: ${only}`);
  console.error("Use --only pending|blocked|done.");
  process.exit(1);
}

if (watch && format === "json") {
  console.error("Watch mode does not support --format json.");
  process.exit(1);
}

const resolvedConfigPath = configPath || path.join(root, "ralph.config.yml");
const tasksPathArg = tasksPath;

function loadConfig(filePath) {
  if (!fs.existsSync(filePath)) return { config: {}, missing: true };
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return { config: yaml.load(content) || {}, missing: false };
  } catch (error) {
    console.error(`Failed to read config at ${filePath}: ${error?.message || error}`);
    process.exit(1);
  }
}

function resolveTasksPath(config, currentPath) {
  if (currentPath !== "tasks.md") return currentPath;
  if (config?.plan?.tasks_path) return config.plan.tasks_path;
  if (config?.run?.tasks_path) return config.run.tasks_path;
  return currentPath;
}

function formatValue(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.length ? value.join(", ") : "[]";
  const trimmed = String(value);
  return trimmed === "" ? "(empty)" : trimmed;
}

function pad(value, width) {
  const text = String(value);
  return text + " ".repeat(Math.max(0, width - text.length));
}

function formatStatus(status) {
  const raw =
    status === "done" ? "[x]" : status === "blocked" ? "[~]" : "[ ]";
  if (status === "done") return { raw, display: colors.green(raw) };
  if (status === "blocked") return { raw, display: colors.yellow(raw) };
  return { raw, display: colors.gray(raw) };
}

function parseTasks(content) {
  const tasks = [];
  const lines = content.split(/\r?\n/);
  let index = 0;
  for (const line of lines) {
    const match = line.match(/^\s*[-*]\s+\[([ x~])\]\s+(.*)$/);
    if (!match) continue;
    index += 1;
    const statusToken = match[1].toLowerCase();
    const status =
      statusToken === "x" ? "done" : statusToken === "~" ? "blocked" : "pending";
    tasks.push({ index, status, text: match[2].trim() });
  }
  return tasks;
}

function summarizeTasks(tasks) {
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "done").length;
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  const pending = total - done - blocked;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, blocked, pending, percent };
}

function filterTasks(tasks, filter) {
  if (!filter) return tasks;
  return tasks.filter((task) => task.status === filter);
}

function extractSuccessCriteria(content) {
  const lines = content.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^(#+\s*)?success criteria\b/i.test(lines[i].trim())) {
      start = i;
      break;
    }
  }
  if (start === -1) return [];
  const items = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^#+\s+/.test(line)) break;
    if (line.startsWith("- ")) items.push(line.slice(2).trim());
    if (line.startsWith("* ")) items.push(line.slice(2).trim());
  }
  return items;
}

function getLastBlocker(logPath) {
  if (!fs.existsSync(logPath)) return "";
  const content = fs.readFileSync(logPath, "utf8");
  const lines = content.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    const match = line.match(/^- Blockers \+ next step:\s*(.*)$/);
    if (match) {
      const text = match[1].trim();
      if (text) return text;
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j].trim();
        if (next) return next;
      }
    }
  }
  return "";
}

function renderTasksHeader(tasksFilePath) {
  if (format === "json") return;
  process.stdout.write(`${colors.cyan("Tasks")}\n`);
  process.stdout.write(`${colors.gray(`File: ${tasksFilePath}`)}\n`);
  process.stdout.write("\n");
}

function renderTasksDivider() {
  if (format === "json") return;
  process.stdout.write(`${colors.gray("--------")}\n`);
}

function renderTasksSummary(summary, logPath) {
  if (format === "json") return;
  process.stdout.write(
    `Total ${summary.total} | ` +
      `${colors.green(`Done ${summary.done}`)} | ` +
      `${colors.yellow(`Blocked ${summary.blocked}`)} | ` +
      `Remaining ${summary.pending} (${summary.percent}%)\n`
  );

  const lastBlocker = getLastBlocker(logPath);
  if (lastBlocker) {
    process.stdout.write(`${colors.yellow(`Last blocker: ${lastBlocker}`)}\n`);
  }
  process.stdout.write("\n");
}

function renderTasksList(filtered) {
  if (format === "json") return;
  if (format === "list") {
    const list = filtered.map((task) => {
      const status = formatStatus(task.status).display;
      return `${task.index}. ${status} ${task.text}`;
    });
    process.stdout.write(list.join("\n"));
    process.stdout.write(list.length ? "\n" : "");
    return;
  }

  const rows = filtered.map((task) => {
    const status = formatStatus(task.status);
    return {
      idxRaw: String(task.index),
      statusRaw: status.raw,
      statusDisplay: status.display,
      text: task.text,
    };
  });

  const idxWidth = Math.max(3, ...rows.map((row) => row.idxRaw.length));
  const statusWidth = Math.max(6, ...rows.map((row) => row.statusRaw.length));

  process.stdout.write(
    `${pad("Idx", idxWidth)}  ${pad("Status", statusWidth)}  Task\n`
  );
  process.stdout.write(
    `${"-".repeat(idxWidth)}  ${"-".repeat(statusWidth)}  ----\n`
  );
  rows.forEach((row) => {
    const statusPadding = " ".repeat(
      Math.max(0, statusWidth - row.statusRaw.length)
    );
    process.stdout.write(
      `${pad(row.idxRaw, idxWidth)}  ${row.statusDisplay}${statusPadding}  ${row.text}\n`
    );
  });
}

function renderCriteriaSection(tasksFilePath, criteria) {
  if (format === "json") return;
  process.stdout.write(`${colors.cyan("Success criteria")}\n`);
  process.stdout.write(`${colors.gray(`File: ${tasksFilePath}`)}\n`);
  process.stdout.write(`Total ${criteria.length}\n\n`);
}

function renderCriteriaList(criteria) {
  if (format === "json") return;
  if (format === "list") {
    const list = criteria.map((item) => `- ${item}`);
    process.stdout.write(list.join("\n"));
    process.stdout.write(list.length ? "\n" : "");
    return;
  }

  const rows = criteria.map((item, index) => ({
    idxRaw: String(index + 1),
    text: item,
  }));
  const idxWidth = Math.max(3, ...rows.map((row) => row.idxRaw.length));
  process.stdout.write(`${pad("Idx", idxWidth)}  Criterion\n`);
  process.stdout.write(`${"-".repeat(idxWidth)}  ---------\n`);
  rows.forEach((row) => {
    process.stdout.write(`${pad(row.idxRaw, idxWidth)}  ${row.text}\n`);
  });
}

function getConfigRows(config) {
  const rows = [];
  const defaults = {
    codex: {
      model: null,
      profile: null,
      sandbox: null,
      ask_for_approval: null,
      full_auto: false,
      model_reasoning_effort: null,
    },
    docker: {
      enabled: false,
      use_for_plan: false,
      base_image: "node:20-bullseye",
      codex_install: "",
    },
    plan: {
      tasks_path: "tasks.md",
      auto_detect_success_criteria: false,
    },
    run: {
      tasks_path: "tasks.md",
      max_iterations: 15,
      max_iteration_seconds: null,
      max_total_seconds: null,
      tail_log: true,
      tail_scratchpad: false,
    },
  };

  const addRow = (key, value, source) => {
    rows.push({
      key,
      value: formatValue(value),
      source,
    });
  };

  const addSection = (sectionKey, fields) => {
    const sectionData = config?.[sectionKey] || {};
    Object.keys(fields).forEach((field) => {
      const source = Object.prototype.hasOwnProperty.call(sectionData, field)
        ? "config"
        : "default";
      const value =
        source === "config" ? sectionData[field] : defaults[sectionKey][field];
      addRow(`${sectionKey}.${field}`, value, source);
    });
  };

  addSection("codex", defaults.codex);
  addSection("docker", defaults.docker);
  addSection("plan", defaults.plan);
  addSection("run", defaults.run);
  return rows;
}

function renderConfigSection(configPathValue, missing, rows, warnings) {
  if (format === "json") return;
  process.stdout.write(`${colors.cyan("Config (effective)")}\n`);
  const note = missing ? " (missing, using defaults)" : "";
  process.stdout.write(`${colors.gray(`File: ${configPathValue}${note}`)}\n\n`);

  if (format === "list") {
    rows.forEach((row) => {
      process.stdout.write(`- ${row.key}: ${row.value} (${row.source})\n`);
    });
  } else {
    const keyWidth = Math.max(3, ...rows.map((row) => row.key.length));
    const valueWidth = Math.max(5, ...rows.map((row) => row.value.length));
    process.stdout.write(
      `${pad("Key", keyWidth)}  ${pad("Value", valueWidth)}  Source\n`
    );
    process.stdout.write(
      `${"-".repeat(keyWidth)}  ${"-".repeat(valueWidth)}  ------\n`
    );
    rows.forEach((row) => {
      const source =
        row.source === "config" ? colors.green(row.source) : colors.gray(row.source);
      process.stdout.write(
        `${pad(row.key, keyWidth)}  ${pad(row.value, valueWidth)}  ${source}\n`
      );
    });
  }

  if (warnings.length > 0) {
    process.stdout.write(`\n${colors.yellow("Warnings:")}\n`);
    warnings.forEach((warning) =>
      process.stdout.write(`${colors.yellow(`- ${warning}`)}\n`)
    );
  }
}

function buildConfigWarnings(config) {
  const warnings = [];
  if (config?.docker?.enabled && !config?.docker?.codex_install) {
    warnings.push("docker.codex_install is required when docker.enabled is true.");
  }
  return warnings;
}

function renderOnce({ allowMissingTasks }) {
  const { config, missing } = loadConfig(resolvedConfigPath);
  const resolvedTasksPath = resolveTasksPath(config, tasksPathArg);
  const tasksFilePath = path.join(root, resolvedTasksPath);
  const logPath = path.join(root, ".ralph", "loop-log.md");

  const needsTasks =
    section === "tasks" || section === "criteria" || section === null;
  const tasksFileExists = fs.existsSync(tasksFilePath);

  const output = {};
  let tasksData = null;
  let criteriaData = null;

  if (needsTasks && !tasksFileExists) {
    if (!allowMissingTasks && (section === "tasks" || section === "criteria")) {
      console.error(`Missing ${resolvedTasksPath}. Run ralph-codex plan first.`);
      process.exit(1);
    }

    const emptySummary = { total: 0, done: 0, blocked: 0, pending: 0, percent: 0 };
    tasksData = {
      path: resolvedTasksPath,
      summary: emptySummary,
      items: [],
      missing: true,
      filtered: {
        only: only || "all",
        limit: limit || 0,
        count: 0,
      },
    };
    criteriaData = {
      path: resolvedTasksPath,
      items: [],
      missing: true,
    };
  } else if (needsTasks) {
    const tasksContent = fs.readFileSync(tasksFilePath, "utf8");
    const allTasks = parseTasks(tasksContent);
    const summary = summarizeTasks(allTasks);
    const filtered = filterTasks(allTasks, only);
    const sliced = limit > 0 ? filtered.slice(0, limit) : filtered;
    const criteria = extractSuccessCriteria(tasksContent);

    tasksData = {
      path: resolvedTasksPath,
      summary,
      items: sliced,
      missing: false,
      filtered: {
        only: only || "all",
        limit: limit || 0,
        count: filtered.length,
      },
    };
    criteriaData = {
      path: resolvedTasksPath,
      items: criteria,
      missing: false,
    };
  }

  if (section === "config" || section === null) {
    const rows = getConfigRows(config);
    const warnings = buildConfigWarnings(config);
    if (format !== "json" && section !== null) {
      renderConfigSection(
        path.relative(root, resolvedConfigPath),
        missing,
        rows,
        warnings
      );
    }
  }

  if (format === "json") {
    if (tasksData && (section === "tasks" || section === null)) {
      output.tasks = tasksData;
    }
    if (criteriaData && (section === "criteria" || section === null)) {
      output.criteria = criteriaData;
    }
    if (section === "config" || section === null) {
      output.config = {
        path: path.relative(root, resolvedConfigPath),
        missing,
        values: getConfigRows(config),
        warnings: buildConfigWarnings(config),
      };
    }
  } else if (section === null) {
    if (criteriaData?.missing) {
      process.stdout.write(
        `${colors.yellow(`Missing ${criteriaData.path}. Task data unavailable.`)}\n\n`
      );
    } else if (criteriaData) {
      renderCriteriaSection(criteriaData.path, criteriaData.items);
      renderCriteriaList(criteriaData.items);
      process.stdout.write("\n");
    }

    const rows = getConfigRows(config);
    const warnings = buildConfigWarnings(config);
    renderConfigSection(path.relative(root, resolvedConfigPath), missing, rows, warnings);
    process.stdout.write("\n");

    if (tasksData?.missing) {
      // Already reported above for criteria.
    } else if (tasksData) {
      renderTasksHeader(tasksData.path);
      renderTasksList(tasksData.items);
      renderTasksDivider();
      renderTasksSummary(tasksData.summary, logPath);
      process.stdout.write("\n");
    }
  } else if (section === "criteria" && criteriaData) {
    if (criteriaData.missing) {
      process.stdout.write(
        `${colors.yellow(`Missing ${criteriaData.path}. Task data unavailable.`)}\n\n`
      );
    } else {
      renderCriteriaSection(criteriaData.path, criteriaData.items);
      renderCriteriaList(criteriaData.items);
    }
  } else if (section === "tasks" && tasksData) {
    if (tasksData.missing) {
      process.stdout.write(
        `${colors.yellow(`Missing ${tasksData.path}. Task data unavailable.`)}\n\n`
      );
    } else {
      renderTasksHeader(tasksData.path);
      renderTasksList(tasksData.items);
      renderTasksDivider();
      renderTasksSummary(tasksData.summary, logPath);
    }
  }

  return {
    output,
    tasksFilePath,
    logPath,
  };
}

function clearScreen() {
  if (process.stdout.isTTY) {
    process.stdout.write("\x1Bc");
  }
}

const watchState = {
  watchers: new Map(),
  pollTimer: null,
};

const debounceMs = 150;
let refreshTimer = null;
let refreshing = false;
let pendingRefresh = false;

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    triggerRefresh();
  }, debounceMs);
}

function buildWatchMap(targets) {
  const map = new Map();
  targets.forEach((filePath) => {
    const dir = path.dirname(filePath);
    const name = path.basename(filePath);
    if (!map.has(dir)) map.set(dir, new Set());
    map.get(dir).add(name);
  });
  return map;
}

function updateWatchers(targetMap) {
  let needsPolling = false;

  for (const [dir, info] of watchState.watchers) {
    if (!targetMap.has(dir)) {
      info.watcher.close();
      watchState.watchers.delete(dir);
    }
  }

  for (const [dir, names] of targetMap) {
    if (watchState.watchers.has(dir)) {
      watchState.watchers.get(dir).names = names;
      continue;
    }

    try {
      const watcher = fs.watch(dir, { persistent: true }, (event, filename) => {
        if (!filename) {
          scheduleRefresh();
          return;
        }
        const name = filename.toString();
        const watched = watchState.watchers.get(dir)?.names;
        if (!watched || watched.has(name)) {
          scheduleRefresh();
        }
      });
      watchState.watchers.set(dir, { watcher, names });
    } catch (_) {
      needsPolling = true;
    }
  }

  if (needsPolling && !watchState.pollTimer) {
    watchState.pollTimer = setInterval(scheduleRefresh, 1000);
  }

  if (!needsPolling && watchState.pollTimer) {
    clearInterval(watchState.pollTimer);
    watchState.pollTimer = null;
  }
}

function renderAndUpdate({ allowMissingTasks }) {
  if (watch) clearScreen();

  const result = renderOnce({ allowMissingTasks });

  if (format === "json") {
    const finalOutput = section ? result.output[section] || {} : result.output;
    process.stdout.write(`${JSON.stringify(finalOutput, null, 2)}\n`);
  }

  if (watch) {
    const watchTargets = [resolvedConfigPath];
    if (section === null || section === "tasks" || section === "criteria") {
      watchTargets.push(result.tasksFilePath);
    }
    if (section === null || section === "tasks") {
      watchTargets.push(result.logPath);
    }
    updateWatchers(buildWatchMap(watchTargets));
    process.stdout.write(
      colors.gray("\nWatching for changes... (Ctrl+C to exit)\n")
    );
  }
}

function triggerRefresh() {
  if (refreshing) {
    pendingRefresh = true;
    return;
  }
  refreshing = true;
  renderAndUpdate({ allowMissingTasks: true });
  refreshing = false;
  if (pendingRefresh) {
    pendingRefresh = false;
    scheduleRefresh();
  }
}

if (watch) {
  renderAndUpdate({ allowMissingTasks: true });
} else {
  renderAndUpdate({ allowMissingTasks: false });
}
