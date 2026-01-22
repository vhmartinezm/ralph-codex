function parseTasks(content) {
  const tasks = [];
  const lines = String(content || "").split(/\r?\n/);
  let index = 0;

  for (const line of lines) {
    const match = line.match(/^\s*[-*]\s+\[([ x~])\]\s+(.*)$/);
    if (!match) continue;
    index += 1;
    const statusToken = match[1].toLowerCase();
    const status =
      statusToken === "x" ? "done" : statusToken === "~" ? "blocked" : "pending";
    tasks.push({
      index,
      status,
      text: match[2].trim(),
      raw: line.trim(),
    });
  }

  return tasks;
}

function parseSuccessCriteria(content) {
  const lines = String(content || "").split(/\r?\n/);
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

function normalizeTaskText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function diffTasks(oldTasks, newTasks) {
  const oldSet = new Set(oldTasks.map((task) => normalizeTaskText(task.text)));
  const newSet = new Set(newTasks.map((task) => normalizeTaskText(task.text)));

  const additions = newTasks.filter(
    (task) => !oldSet.has(normalizeTaskText(task.text))
  );
  const removals = oldTasks.filter(
    (task) => !newSet.has(normalizeTaskText(task.text))
  );

  const modified = [];
  const compareCount = Math.min(oldTasks.length, newTasks.length);
  for (let i = 0; i < compareCount; i += 1) {
    const before = oldTasks[i];
    const after = newTasks[i];
    if (
      before.status !== after.status ||
      normalizeTaskText(before.text) !== normalizeTaskText(after.text)
    ) {
      modified.push({
        index: i + 1,
        before,
        after,
      });
    }
  }

  return { additions, removals, modified };
}

function diffCriteria(oldCriteria, newCriteria) {
  const oldSet = new Set(oldCriteria);
  const newSet = new Set(newCriteria);
  const added = newCriteria.filter((item) => !oldSet.has(item));
  const removed = oldCriteria.filter((item) => !newSet.has(item));
  return { added, removed };
}

export {
  diffCriteria,
  diffTasks,
  normalizeTaskText,
  parseSuccessCriteria,
  parseTasks,
};
