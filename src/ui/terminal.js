import pc from "picocolors";
import ora from "ora";
import cliProgress from "cli-progress";

const isTty = Boolean(process.stdout.isTTY);
const colorEnabled = isTty && !process.env.NO_COLOR;

const wrap = (fn) => (text) => (colorEnabled ? fn(text) : text);
const grayFn = pc.gray || pc.dim;

const colors = {
  red: wrap(pc.red),
  green: wrap(pc.green),
  yellow: wrap(pc.yellow),
  blue: wrap(pc.blue),
  magenta: wrap(pc.magenta),
  cyan: wrap(pc.cyan),
  gray: wrap(grayFn),
  dim: wrap(pc.dim),
};

function createSpinner(text) {
  if (!isTty || process.env.NO_COLOR) {
    if (text) process.stdout.write(`${text}\n`);
    return {
      start() {},
      stop() {},
      succeed() {},
      fail() {},
    };
  }

  const spinner = ora({
    text,
    spinner: { interval: 120, frames: ["-", "\\", "|", "/"] },
  });
  spinner.start();
  return spinner;
}

function createProgressBar() {
  if (!isTty) return null;
  return new cliProgress.SingleBar(
    {
      format: `${colors.cyan("{bar}")} {percentage}% | {value}/{total} tasks | ~{blocked} | Iter {iteration}/{iterations}`,
      barCompleteChar: "#",
      barIncompleteChar: "-",
      hideCursor: true,
      clearOnComplete: false,
      stopOnComplete: false,
      forceRedraw: true,
    }
  );
}

function createLogStyler() {
  const pathRegex =
    /(^|\s)(\.{0,2}\/[A-Za-z0-9._/-]+|[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+|[A-Za-z0-9._-]+\.(?:js|ts|tsx|jsx|md|yml|yaml|json|toml|go|py|rs|java|kt|sh|bash|zsh|sql|css|scss|html|txt))(?!\w)/g;

  let inCodeBlock = false;
  let inHeader = false;
  let inDiffHunk = false;

  const highlightInline = (line) =>
    line.replace(/`([^`]+)`/g, (match) => colors.blue(match));
  const highlightPaths = (line) =>
    line.replace(pathRegex, (match, prefix, pathPart) => {
      return `${prefix}${colors.magenta(pathPart)}`;
    });

  const formatLine = (line) => {
    if (!colorEnabled || line === "") return line;
    const trimmed = line.trim();
    if (trimmed === "--------") {
      inHeader = !inHeader;
      return colors.gray(line);
    }
    if (inHeader) return colors.gray(line);
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      return colors.gray(line);
    }
    if (inCodeBlock) return colors.gray(line);

    if (/^diff --|^index |^\+\+\+|^---/.test(trimmed)) {
      inDiffHunk = false;
      return colors.magenta(line);
    }
    if (/^@@/.test(trimmed)) {
      inDiffHunk = true;
      return colors.magenta(line);
    }

    const looksLikeList = /^[-+]\s+/.test(trimmed);
    if (inDiffHunk && /^\+\s?/.test(trimmed) && !/^\+\+\+/.test(trimmed) && !looksLikeList) {
      return colors.green(line);
    }
    if (inDiffHunk && /^-\s?/.test(trimmed) && !/^---/.test(trimmed) && !looksLikeList) {
      return colors.red(line);
    }
    if (/^-\s+\[[xX]\]/.test(trimmed)) return colors.green(line);
    if (/^-\s+\[~\]/.test(trimmed)) return colors.yellow(line);
    if (/^-\s+\[\s\]/.test(trimmed)) return colors.gray(line);

    if (/\b(error|failed|exception|traceback|fatal)\b/i.test(trimmed)) {
      return colors.red(line);
    }
    if (/\b(warn|warning|deprecated)\b/i.test(trimmed)) {
      return colors.yellow(line);
    }
    if (/\b(success|succeeded|done|complete|completed)\b/i.test(trimmed)) {
      return colors.green(line);
    }
    if (/^#{1,6}\s+/.test(trimmed)) return colors.cyan(line);
    if (trimmed.endsWith("?")) return colors.yellow(line);
    if (/^\$\s+/.test(trimmed) || /^>\s+/.test(trimmed)) {
      return colors.blue(line);
    }

    let styled = highlightInline(line);
    if (!styled.includes("`")) {
      styled = highlightPaths(styled);
    }
    if (trimmed.length >= 140) return colors.dim(styled);
    return styled;
  };

  return { formatLine };
}

export {
  colors,
  colorEnabled,
  createSpinner,
  createProgressBar,
  createLogStyler,
};
