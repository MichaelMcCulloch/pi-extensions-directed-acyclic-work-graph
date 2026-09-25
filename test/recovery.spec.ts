import { describe, expect, it } from "vitest";
import type { DagState } from "../src/engine/state.ts";
import { DagStore } from "../src/extension/store.ts";
import { modelDeclarations } from "./helpers.ts";

/** A snapshot log that can be truncated to simulate a lost durable append. */
function log(): { persistence: { append: (state: DagState) => void }; snapshots: DagState[] } {
  const snapshots: DagState[] = [];
  return { persistence: { append: (state) => snapshots.push(state) }, snapshots };
}

function boot(store: DagStore, node = "n1"): void {
  store.dispatch(node, { base: "base0", worktree: `/wt/${node}`, branch: `dsh/dag/1/${node}` });
  store.finishWorktree(node);
  store.admit(node);
}

describe("crash recovery (the model's Crash + Reopen + Reconcile)", () => {
  it("clears a stale effect and re-arms the node in place", () => {
    const durable = log();
    const store = new DagStore(durable.persistence);
    store.declare(modelDeclarations());
    boot(store);
    expect(store.state.nodes["n1"]?.effect).toBe("running");

    // Process restart: a fresh store from the last durable snapshot.
    const restarted = new DagStore({ append() {} }, durable.snapshots.at(-1)!);
    expect(restarted.state.nodes["n1"]?.effect).toBe("running"); // stale as persisted
    restarted.recover();
    expect(restarted.state.nodes["n1"]?.effect).toBe("idle");
    expect(restarted.state.nodes["n1"]?.status).toBe("starting");
    expect(restarted.state.nodes["n1"]?.cmd).toBe("accepted");
    expect(restarted.violations()).toEqual([]);
  });

  it("reopens an interrupted merge and integrates idempotently", () => {
    const durable = log();
    const store = new DagStore(durable.persistence);
    store.declare(modelDeclarations());
    boot(store);
    store.checkFiles("n1");
    store.settle("n1", "complete", "done", "commit-n1");
    store.beginMerge("n1");
    expect(store.state.nodes["n1"]?.merging).toBe(true);

    const restarted = new DagStore({ append() {} }, durable.snapshots.at(-1)!);
    restarted.recover();
    expect(restarted.state.nodes["n1"]?.merging).toBe(false);
    expect(restarted.state.nodes["n1"]?.status).toBe("completed");
    restarted.beginMerge("n1");
    restarted.recordMerge("n1", "merge-n1");
    restarted.removeNode("n1");
    expect(restarted.state.nodes["n1"]?.gstate).toBe("removed");
    expect(restarted.violations()).toEqual([]);
  });

  it("recovers from a truncated snapshot log", () => {
    const durable = log();
    const store = new DagStore(durable.persistence);
    store.declare(modelDeclarations());
    boot(store);
    // The last append was never durable: reopen from the previous snapshot.
    const truncated = durable.snapshots[durable.snapshots.length - 2]!;
    const restarted = new DagStore({ append() {} }, truncated);
    restarted.recover();
    expect(restarted.violations()).toEqual([]);
    // The node is either pending or re-armed; either way it is a model state.
    expect(["pending", "starting"]).toContain(restarted.state.nodes["n1"]?.status);
  });

  it("does not burn a revision on a recovery that changes nothing", () => {
    const store = new DagStore({ append() {} });
    store.declare(modelDeclarations());
    const revision = store.state.revision;
    store.recover();
    expect(store.state.revision).toBe(revision);
  });

  it("repairs a snapshot that predates the commit, worktree, and file-check fields", () => {
    const durable = log();
    const store = new DagStore(durable.persistence);
    store.declare(modelDeclarations());
    store.dispatch("n1", { base: "base0", worktree: "/wt/n1", branch: "dsh/dag/1/n1" });
    store.finishWorktree("n1");
    store.admit("n1");
    store.checkFiles("n1");
    store.settle("n1", "complete", "done", "commit-n1");
    const legacy = structuredClone(durable.snapshots.at(-1)!) as DagState;
    for (const node of Object.values(legacy.nodes)) {
      const raw = node as unknown as Record<string, unknown>;
      delete raw["checked"];
      delete raw["committed"];
      delete raw["registered"];
      delete raw["gstate"];
      delete raw["completedGen"];
    }
    // A session reload must not brick on an older snapshot.
    const restarted = new DagStore({ append() {} }, legacy);
    restarted.recover();
    expect(restarted.violations()).toEqual([]);
    expect(restarted.state.nodes["n1"]?.checked).toBe(true);
    expect(restarted.state.nodes["n1"]?.committed).toBe(true);
    expect(restarted.state.nodes["n1"]?.gstate).toBe("completed");
  });

  it("grandfathers dependency integration for snapshots from before the coupling", () => {
    const durable = log();
    const store = new DagStore(durable.persistence);
    store.declare(modelDeclarations());
    store.dispatch("n1", { base: "base0", worktree: "/wt/n1", branch: "dsh/dag/1/n1" });
    store.finishWorktree("n1");
    store.admit("n1");
    store.checkFiles("n1");
    store.settle("n1", "complete", "done", "commit-n1");
    store.beginMerge("n1");
    store.recordMerge("n1", "merge-n1");
    store.dispatch("n2", { base: "base1", worktree: "/wt/n2", branch: "dsh/dag/1/n2" });
    store.finishWorktree("n2");
    store.admit("n2");
    store.checkFiles("n2");
    store.settle("n2", "complete", "done", "commit-n2");
    // The old model let n2 run with n1 merely completed, not integrated.
    const snapshot = structuredClone(durable.snapshots.at(-1)!) as DagState;
    const legacy: DagState = {
      ...snapshot,
      nodes: {
        ...snapshot.nodes,
        n1: { ...snapshot.nodes["n1"]!, integrated: false, gstate: "completed" },
      },
    };
    const restarted = new DagStore({ append() {} }, legacy);
    expect(restarted.state.nodes["n1"]?.integrated).toBe(true);
    expect(restarted.violations()).toEqual([]);
  });
});
