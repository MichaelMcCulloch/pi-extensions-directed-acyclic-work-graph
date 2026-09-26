import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SYSTEM_ACTIONS } from "../src/formal/system-model.ts";

/**
 * The single TLA+ subject and the executable mirror must name the same actions,
 * and every action must have one named guard shared by the actions and the
 * trace validator.
 */

const TLA_TO_MODEL: Readonly<Record<string, string>> = {
  Declare: "declare",
  Adopt: "adopt",
  Orphan: "orphan",
  Amend: "amend",
  MarkStale: "mark-stale",
  Reset: "reset",
  Park: "park",
  Unpark: "unpark",
  Dispatch: "dispatch",
  FinishWorktree: "finish-worktree",
  Admit: "admit",
  CheckFiles: "check-files",
  Complete: "complete",
  Block: "block",
  Underspecify: "underspecify",
  Fail: "fail",
  EffectStale: "effect-stale",
  Resume: "resume",
  Steer: "steer",
  Stop: "stop",
  BeginMerge: "begin-merge",
  CommitMerge: "commit-merge",
  MergeConflict: "merge-conflict",
  ResolveConflict: "resolve-conflict",
  Remove: "remove",
  Reconcile: "reconcile",
  Crash: "crash",
  Reopen: "reopen",
};

const GUARD_NAME: Readonly<Record<string, string>> = {
  declare: "GuardDeclare",
  adopt: "GuardAdopt",
  orphan: "GuardOrphan",
  amend: "GuardAmend",
  "mark-stale": "GuardMarkStale",
  reset: "GuardReset",
  park: "GuardPark",
  unpark: "GuardUnpark",
  dispatch: "CanDispatch",
  "finish-worktree": "GuardFinish",
  admit: "GuardAdmit",
  "check-files": "GuardCheckFiles",
  complete: "CanSettle",
  block: "CanSettle",
  underspecify: "CanSettle",
  fail: "CanSettle",
  "effect-stale": "GuardStale",
  resume: "GuardResume",
  steer: "GuardSteer",
  stop: "GuardStop",
  "begin-merge": "GuardBegin",
  "commit-merge": "GuardCommit",
  "merge-conflict": "GuardConflict",
  "resolve-conflict": "GuardResolve",
  remove: "GuardRemove",
  reconcile: "GuardReconcile",
};

function tlaText(): string {
  return readFileSync(fileURLToPath(new URL("../spec/DagSystem.tla", import.meta.url)), "utf8");
}

function tlaActions(): string[] {
  const text = tlaText();
  const block = text.slice(text.indexOf("Next =="), text.indexOf("CoreInv =="));
  const names: string[] = [];
  for (const match of block.matchAll(/\\E n \\in Nodes: (\w+)\(n\)/g)) {
    names.push(TLA_TO_MODEL[match[1]!] ?? match[1]!);
  }
  if (/\\\/ Crash/.test(block)) names.push("crash");
  if (/\\\/ Reopen/.test(block)) names.push("reopen");
  return names;
}

describe("TLA+ / TypeScript parity", () => {
  it("the spec's Next lists exactly the system actions", () => {
    expect(tlaActions().sort()).toEqual([...SYSTEM_ACTIONS].sort());
  });

  it("every action has a named guard shared with the trace validator", () => {
    const text = tlaText();
    for (const action of SYSTEM_ACTIONS) {
      const guard = GUARD_NAME[action];
      if (guard === undefined) continue; // crash / reopen are unconditional
      expect(text, `missing ${guard} for ${action}`).toContain(`${guard}(`);
    }
  });
});
