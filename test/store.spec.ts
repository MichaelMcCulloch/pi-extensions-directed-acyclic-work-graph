import { describe, expect, it } from "vitest";
import { DagOperationError, DagStore } from "../src/extension/store.ts";
import type { DagState } from "../src/engine/state.ts";
import { modelDeclarations } from "./helpers.ts";

function memory(): { persistence: { append: (state: DagState) => void }; snapshots: DagState[] } {
  const snapshots: DagState[] = [];
  return { persistence: { append: (state) => snapshots.push(state) }, snapshots };
}

function dispatch(store: DagStore, node: string): void {
  store.dispatch(node, { base: "base0", worktree: `/wt/${node}`, branch: `dsh/dag/1/${node}` });
  store.finishWorktree(node);
  store.admit(node);
}

function integrate(store: DagStore, node: string): void {
  store.settle(node, "complete", "done", `commit-${node}`);
  store.beginMerge(node);
  store.recordMerge(node, `merge-${node}`);
  store.removeNode(node);
}

describe("DagStore (single composed machine)", () => {
  it("runs a chain through dispatch → worktree → complete → integrate → remove", () => {
    const { persistence, snapshots } = memory();
    const store = new DagStore(persistence);
    store.declare(modelDeclarations());
    expect(store.board.ready).toEqual(["n1"]);

    for (const node of ["n1", "n2", "n3"]) {
      dispatch(store, node);
      expect(store.state.nodes[node]?.status).toBe("in_progress");
      integrate(store, node);
      expect(store.state.nodes[node]?.gstate).toBe("removed");
    }

    expect(store.board.counts.completed).toBe(3);
    expect(store.board.ready).toEqual([]);
    expect(store.violations()).toEqual([]);
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.at(-1)?.revision).toBe(store.state.revision);
  });

  it("refuses to dispatch a dependent whose dependency is not integrated", () => {
    const store = new DagStore(memory().persistence);
    store.declare(modelDeclarations());
    dispatch(store, "n1");
    store.settle("n1", "complete", "done", "commit-n1");
    // The scheduler considers n2 ready; the composed model does not.
    expect(store.state.nodes["n2"]?.status).toBe("pending");
    expect(store.canDispatch("n2")).toBe(false);
    store.beginMerge("n1");
    store.recordMerge("n1", "merge-n1");
    store.removeNode("n1");
    expect(store.canDispatch("n2")).toBe(true);
  });

  it("refuses overlapping declared files", () => {
    const store = new DagStore(memory().persistence);
    expect(() =>
      store.declare([
        { id: "a", content: "x", brief: "VALIDATION: y ACCEPTANCE: z", deps: [], files: ["src/x.ts"] },
        { id: "b", content: "x", brief: "VALIDATION: y ACCEPTANCE: z", deps: [], files: ["src/x.ts"] },
      ]),
    ).toThrow(DagOperationError);
  });

  it("keeps underspecified first-class and resumable", () => {
    const store = new DagStore(memory().persistence);
    store.declare(modelDeclarations());
    dispatch(store, "n1");
    const settled = store.settle("n1", "underspecify", "which API?");
    expect(settled.settlement).toBe("underspecify");
    expect(store.state.nodes["n1"]?.status).toBe("underspecified");
    // The worktree survives, so the node can be resumed in place.
    expect(store.state.nodes["n1"]?.gstate).toBe("created");
    store.apply({ type: "resume", node: "n1", message: "use v2" });
    expect(store.state.nodes["n1"]?.status).toBe("starting");
    expect(store.violations()).toEqual([]);
  });

  it("drops a stale effect after a steer", () => {
    const store = new DagStore(memory().persistence);
    store.declare(modelDeclarations());
    dispatch(store, "n1");
    store.apply({ type: "steer", node: "n1", message: "replace" });
    expect(store.state.nodes["n1"]?.status).toBe("starting");
    expect(store.state.nodes["n1"]?.effect).toBe("running");
    store.apply({ type: "effect-stale", node: "n1" });
    expect(store.state.nodes["n1"]?.effect).toBe("idle");
    expect(store.state.droppedEffects).toBe(1);
    expect(store.violations()).toEqual([]);
  });

  it("reopens into a recoverable state and re-arms", () => {
    const store = new DagStore(memory().persistence);
    store.declare(modelDeclarations());
    dispatch(store, "n1");
    expect(store.state.nodes["n1"]?.effect).toBe("running");
    store.reopen();
    expect(store.state.nodes["n1"]?.effect).toBe("idle");
    store.apply({ type: "reconcile", node: "n1" });
    expect(store.state.nodes["n1"]?.status).toBe("starting");
    expect(store.violations()).toEqual([]);
  });
});
