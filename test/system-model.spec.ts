import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SYSTEM_MODEL,
  enabledSystemEvents,
  initAbstractSystemState,
  referenceReduceSystemState,
  systemGuards,
  systemInvariantViolations,
  type AbstractSystemState,
} from "../src/formal/system-model.ts";

/**
 * Exhaustive exploration of the single composed model, and the count
 * cross-check against the one TLC run (`spec/DagSystem.tla`). There are no
 * half-models left to drift from.
 */

const MAX_STATES = 500_000;

function key(state: AbstractSystemState): string {
  const nodes = [...SYSTEM_MODEL.nodes].sort();
  return JSON.stringify([
    nodes.map((n) => state.declared[n]),
    nodes.map((n) => state.files[n]),
    nodes.map((n) => state.status[n]),
    nodes.map((n) => state.gen[n]),
    nodes.map((n) => state.cmd[n]),
    nodes.map((n) => state.effect[n]),
    nodes.map((n) => state.effectFence[n]),
    nodes.map((n) => state.completedGen[n]),
    state.dropped,
    nodes.map((n) => state.gstate[n]),
    nodes.map((n) => state.committed[n]),
    nodes.map((n) => state.integrated[n]),
    nodes.map((n) => state.registered[n]),
    nodes.map((n) => state.merging[n]),
  ]);
}

function explore(): Map<string, AbstractSystemState> {
  const start = initAbstractSystemState();
  const queue: AbstractSystemState[] = [start];
  const visited = new Map<string, AbstractSystemState>([[key(start), start]]);
  while (queue.length > 0) {
    const state = queue.shift()!;
    if (visited.size > MAX_STATES) throw new Error("state cap exceeded");
    expect(systemInvariantViolations(state), `invariant at ${key(state)}`).toEqual([]);
    for (const event of enabledSystemEvents(state)) {
      const next = referenceReduceSystemState(state, event);
      const k = key(next);
      if (!visited.has(k)) {
        visited.set(k, next);
        queue.push(next);
      }
    }
  }
  return visited;
}

describe("composed DAG system model", () => {
  const visited = explore();

  it("never leaves the composed invariant", () => {
    for (const state of visited.values()) expect(systemInvariantViolations(state)).toEqual([]);
  });

  it("reaches exactly the state set the one TLC run model-checked", () => {
    const countPath = fileURLToPath(new URL("../spec/.tlc-state-count.json", import.meta.url));
    expect(existsSync(countPath), "run `pnpm run verify:model` first").toBe(true);
    const parsed = JSON.parse(readFileSync(countPath, "utf8")) as { models?: Record<string, number> };
    expect(parsed.models?.DagSystem).toBeTypeOf("number");
    expect(visited.size).toBe(parsed.models!.DagSystem);
  });

  it("refuses overlapping declared files (modelled, not just validated)", () => {
    let state = initAbstractSystemState();
    state = referenceReduceSystemState(state, { type: "declare", node: "n1", files: ["f1"] });
    expect(
      systemGuards.declare(SYSTEM_MODEL, state, "n2", ["f1"]),
      "n2 must not be able to claim f1 once n1 owns it",
    ).toBe(false);
    state = referenceReduceSystemState(state, { type: "declare", node: "n2", files: ["f2"] });
    expect(systemInvariantViolations(state)).toEqual([]);
  });

  it("will not dispatch a node whose dependency is completed but not integrated", () => {
    let state = initAbstractSystemState();
    state = referenceReduceSystemState(state, { type: "declare", node: "n1", files: [] });
    state = referenceReduceSystemState(state, { type: "declare", node: "n2", files: [] });
    state = referenceReduceSystemState(state, { type: "dispatch", node: "n1" });
    state = referenceReduceSystemState(state, { type: "finish-worktree", node: "n1" });
    state = referenceReduceSystemState(state, { type: "admit", node: "n1" });
    state = referenceReduceSystemState(state, { type: "complete", node: "n1" });
    // n1 is core-completed, so the scheduler would call n2 ready...
    expect(systemGuards.dispatch(SYSTEM_MODEL, state, "n2")).toBe(false);
    // ...but the worktree layer requires integration first.
    state = referenceReduceSystemState(state, { type: "begin-merge", node: "n1" });
    state = referenceReduceSystemState(state, { type: "commit-merge", node: "n1" });
    expect(systemGuards.dispatch(SYSTEM_MODEL, state, "n2")).toBe(true);
  });

  it("recovers an interrupted merge and never removes un-integrated work", () => {
    let state = initAbstractSystemState();
    state = referenceReduceSystemState(state, { type: "declare", node: "n1", files: [] });
    state = referenceReduceSystemState(state, { type: "dispatch", node: "n1" });
    state = referenceReduceSystemState(state, { type: "finish-worktree", node: "n1" });
    state = referenceReduceSystemState(state, { type: "admit", node: "n1" });
    state = referenceReduceSystemState(state, { type: "complete", node: "n1" });
    expect(() => referenceReduceSystemState(state, { type: "remove", node: "n1" })).toThrow();
    state = referenceReduceSystemState(state, { type: "begin-merge", node: "n1" });
    state = referenceReduceSystemState(state, { type: "crash" });
    expect(state.merging["n1"]).toBe(false);
    expect(state.integrated["n1"]).toBe(false);
    state = referenceReduceSystemState(state, { type: "begin-merge", node: "n1" });
    state = referenceReduceSystemState(state, { type: "commit-merge", node: "n1" });
    state = referenceReduceSystemState(state, { type: "remove", node: "n1" });
    expect(state.gstate["n1"]).toBe("removed");
    expect(systemInvariantViolations(state)).toEqual([]);
  });

  it("distinguishes blocked from underspecified and resumes both", () => {
    let state = initAbstractSystemState();
    state = referenceReduceSystemState(state, { type: "declare", node: "n1", files: [] });
    state = referenceReduceSystemState(state, { type: "dispatch", node: "n1" });
    state = referenceReduceSystemState(state, { type: "finish-worktree", node: "n1" });
    state = referenceReduceSystemState(state, { type: "admit", node: "n1" });
    const blocked = referenceReduceSystemState(state, { type: "block", node: "n1" });
    expect(blocked.status["n1"]).toBe("blocked");
    const underspecified = referenceReduceSystemState(state, { type: "underspecify", node: "n1" });
    expect(underspecified.status["n1"]).toBe("underspecified");
    expect(referenceReduceSystemState(underspecified, { type: "resume", node: "n1" }).status["n1"]).toBe("starting");
  });
});
