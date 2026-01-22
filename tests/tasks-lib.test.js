import { describe, it, expect } from "vitest";
import {
  diffCriteria,
  diffTasks,
  parseSuccessCriteria,
  parseTasks,
} from "../src/lib/tasks.js";

describe("tasks lib", () => {
  it("parses tasks with status and index", () => {
    const content = `# Tasks
- [ ] One
- [x] Two
- [~] Blocked
`;
    const tasks = parseTasks(content);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].status).toBe("pending");
    expect(tasks[1].status).toBe("done");
    expect(tasks[2].status).toBe("blocked");
    expect(tasks[2].index).toBe(3);
  });

  it("parses success criteria list", () => {
    const content = `## Success criteria
- Run tests
- Ship it
`;
    const criteria = parseSuccessCriteria(content);
    expect(criteria).toEqual(["Run tests", "Ship it"]);
  });

  it("diffs tasks and criteria", () => {
    const before = parseTasks(`- [ ] One\n- [ ] Two\n`);
    const after = parseTasks(`- [x] One\n- [ ] Two\n- [ ] Three\n`);

    const taskDiff = diffTasks(before, after);
    expect(taskDiff.additions).toHaveLength(1);
    expect(taskDiff.removals).toHaveLength(0);
    expect(taskDiff.modified).toHaveLength(1);

    const criteriaDiff = diffCriteria(["A", "B"], ["A", "C"]);
    expect(criteriaDiff.added).toEqual(["C"]);
    expect(criteriaDiff.removed).toEqual(["B"]);
  });
});
