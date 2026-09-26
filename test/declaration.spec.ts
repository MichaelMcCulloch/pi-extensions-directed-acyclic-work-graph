import { describe, expect, it } from "vitest";
import { DagOperationError, DagStore } from "../src/extension/store.ts";
import type { DagState, NodeDeclaration } from "../src/engine/state.ts";
import { modelDeclarations } from "./helpers.ts";

function memory(): { persistence: { append: (state: DagState) => void }; snapshots: DagState[] } {
  const snapshots: DagState[] = [];
  return { persistence: { append: (state) => snapshots.push(state) }, snapshots };
}

function store(): DagStore {
  return new DagStore(memory().persistence);
}

function dispatch(s: DagStore, node: string): void {
  s.dispatch(node, { base: "base0", worktree: `/wt/${node}`, branch: `dsh/dag/1/${node}` });
  s.finishWorktree(node);
  s.admit(node);
}

function node(id: string, deps: string[] = [], extra: Partial<NodeDeclaration> = {}): NodeDeclaration {
  return { id, content: `${id} work`, brief: "VALIDATION: x. ACCEPTANCE: y.", deps, ...extra };
}

describe("declaration is an idempotent upsert", () => {
  it("re-declaring the same graph changes nothing", () => {
    const s = store();
    s.declare(modelDeclarations());
    const revision = s.state.revision;
    const again = s.declare(modelDeclarations());
    expect(again.applied).toBe(true);
    expect(again.diff.unchanged).toEqual(["n1", "n2", "n3"]);
    expect(s.state.revision).toBe(revision);
  });

  it("retains absent nodes as orphaned rather than deleting them", () => {
    const s = store();
    s.declare([node("a"), node("b", ["a"])]);
    const result = s.declare([node("a")]);
    expect(result.diff.orphaned).toEqual(["b"]);
    const b = s.state.nodes["b"]!;
    expect(b.orphaned).toBe(true);
    expect(b.declared).toBe(true);
    expect(s.board.ready).toEqual(["a"]);
  });

  it("re-adopts an orphaned node and clears its files", () => {
    const s = store();
    s.declare([node("a", [], { files: ["f1"] })]);
    s.declare([]); // orphan a
    expect(s.state.nodes["a"]!.orphaned).toBe(true);
    expect(s.state.nodes["a"]!.files).toEqual([]);
    const adopted = s.declare([node("a", [], { files: ["f1"] }), node("b")]);
    expect(adopted.diff.adopted).toEqual(["a"]);
    expect(s.state.nodes["a"]!.orphaned).toBe(false);
    expect(s.state.nodes["a"]!.files).toEqual(["f1"]);
  });

  it("dry_run reports the diff without applying", () => {
    const s = store();
    s.declare([node("a")]);
    const revision = s.state.revision;
    const dry = s.declare([node("a"), node("b")], { dryRun: true });
    expect(dry.applied).toBe(false);
    expect(dry.diff.added).toEqual(["b"]);
    expect(s.state.revision).toBe(revision);
    expect(s.state.nodes["b"]).toBeUndefined();
  });

  it("refuses a stale expect_revision", () => {
    const s = store();
    s.declare([node("a")]);
    expect(() => s.declare([node("a")], { expectRevision: 0 })).toThrow(DagOperationError);
    expect(() => s.declare([node("a")], { expectRevision: s.state.revision })).not.toThrow();
  });

  it("refuses to prune a node another node still depends on, but prunes a leaf", () => {
    const s = store();
    s.declare([node("a"), node("b", ["a"])]);
    expect(() => s.prune("a")).toThrow(DagOperationError);
    s.prune("b");
    expect(s.state.nodes["b"]).toBeUndefined();
    expect(s.state.order).toEqual(["a"]);
  });

  it("does not resurrect unrelated orphans when pruning", () => {
    const s = store();
    s.declare([node("a"), node("b"), node("c")]);
    s.declare([node("a"), node("c")]); // orphan b
    expect(s.state.nodes["b"]!.orphaned).toBe(true);
    s.prune("c");
    expect(s.state.nodes["b"]!.orphaned).toBe(true);
    expect(s.state.nodes["c"]).toBeUndefined();
  });

  it("refuses an unsequenceable declared-file swap", () => {
    const s = store();
    s.declare([node("a", [], { files: ["f1"] }), node("b", [], { files: ["f2"] })]);
    expect(() =>
      s.declare([node("a", [], { files: ["f2"] }), node("b", [], { files: ["f1"] })]),
    ).toThrow(DagOperationError);
  });
});

describe("definition changes and stale", () => {
  it("marks a completed-but-unintegrated node stale instead of resetting it", () => {
    const s = store();
    s.declare([node("a")]);
    dispatch(s, "a");
    s.checkFiles("a");
    s.settle("a", "complete", "done", "commit-a");
    expect(s.state.nodes["a"]!.status).toBe("completed");

    const result = s.edit("a", { content: "new intent" });
    expect(result.diff.stale).toEqual(["a"]);
    expect(s.state.nodes["a"]!.status).toBe("stale");
    // The completion facts survive; nothing is silently re-dispatched.
    expect(s.state.nodes["a"]!.committed).toBe(true);
    expect(s.board.ready).toEqual([]);
  });

  it("resets a stale node to pending and clears the worktree facts", () => {
    const s = store();
    s.declare([node("a")]);
    dispatch(s, "a");
    s.checkFiles("a");
    s.settle("a", "complete", "done", "commit-a");
    s.edit("a", { content: "new intent" });
    s.reset("a");
    const a = s.state.nodes["a"]!;
    expect(a.status).toBe("pending");
    expect(a.gstate).toBe("absent");
    expect(a.committed).toBe(false);
    expect(a.worktree).toBeNull();
    expect(s.board.ready).toEqual(["a"]);
  });

  it("refuses to change an integrated node", () => {
    const s = store();
    s.declare([node("a")]);
    dispatch(s, "a");
    s.checkFiles("a");
    s.settle("a", "complete", "done", "commit-a");
    s.beginMerge("a");
    s.recordMerge("a", "merge-a");
    expect(() => s.edit("a", { content: "too late" })).toThrow(DagOperationError);
  });

  it("refuses a dependency change on a non-pending node", () => {
    const s = store();
    s.declare([node("a"), node("b")]);
    dispatch(s, "b");
    expect(() => s.link("b", ["a"])).toThrow(DagOperationError);
  });
});

describe("manual block parks dependents", () => {
  it("parks a pending node, blocks its dependents, and unblocks", () => {
    const s = store();
    s.declare([node("a"), node("b", ["a"])]);
    s.park("a", "external release");
    expect(s.state.nodes["a"]!.status).toBe("parked");
    expect(s.board.ready).toEqual([]);
    const b = s.board.nodes.find((entry) => entry.id === "b")!;
    expect(b.ready).toBe(false);
    expect(b.waitingOn).toEqual([{ dep: "a", reason: "blocked: external release" }]);

    s.unpark("a");
    expect(s.board.ready).toEqual(["a"]);
  });

  it("refuses to park a node that is not pending", () => {
    const s = store();
    s.declare([node("a")]);
    dispatch(s, "a");
    expect(() => s.park("a", "x")).toThrow(DagOperationError);
  });
});

describe("link/unlink and plan", () => {
  it("adds and removes edges on a pending node", () => {
    const s = store();
    s.declare([node("a"), node("b")]);
    s.link("b", ["a"]);
    expect(s.state.nodes["b"]!.deps).toEqual(["a"]);
    expect(s.link("b", ["a"]).diff.edges_added).toEqual([]);
    s.unlink("b", ["a"]);
    expect(s.state.nodes["b"]!.deps).toEqual([]);
  });

  it("reports the topologically ordered waves", () => {
    const s = store();
    s.declare(modelDeclarations());
    expect(s.plan.waves.map((wave) => ({ index: wave.index, nodes: wave.nodes.map((n) => n.id) }))).toEqual([
      { index: 1, nodes: ["n1"] },
      { index: 2, nodes: ["n2"] },
      { index: 3, nodes: ["n3"] },
    ]);
  });

  it("warns when a brief announces an external condition but the node is ready", () => {
    const s = store();
    const result = s.declare([
      { id: "a", content: "a", brief: "EXTERNAL: a release. VALIDATION: x. ACCEPTANCE: y.", deps: [] },
    ]);
    expect(result.warnings.length).toBe(1);
  });

  it("keeps an existing definition verbatim with keep: true", () => {
    const s = store();
    s.declare([node("a"), node("b", ["a"])]);
    dispatch(s, "a");
    s.checkFiles("a");
    s.settle("a", "complete", "done", "commit-a");
    s.beginMerge("a");
    s.recordMerge("a", "merge-a");
    // Re-state the graph without replaying a's finished body; b is unchanged too.
    const result = s.declare([{ id: "a", keep: true }, { id: "b", keep: true }]);
    expect(result.diff.unchanged).toEqual(["a", "b"]);
    expect(s.state.nodes["a"]!.content).toBe("a work");
    expect(s.state.nodes["a"]!.integrated).toBe(true);
  });

  it("refuses keep: true for an unknown node", () => {
    const s = store();
    expect(() => s.declare([{ id: "ghost", keep: true }])).toThrow(DagOperationError);
  });
});
