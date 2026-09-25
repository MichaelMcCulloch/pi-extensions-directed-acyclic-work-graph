import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { conflictedFiles, git } from "../src/engine/git.ts";
import { existsSync } from "node:fs";
import type { NodeDeclaration } from "../src/engine/state.ts";
import { DagDispatcher, PiSpawner, type NodeOutcomeKind, type NodeReport, type ResolveRequest, type SpawnRequest, type Spawner } from "../src/extension/dispatcher.ts";
import { DagStore } from "../src/extension/store.ts";
import { modelDeclarations } from "./helpers.ts";

const created: string[] = [];

function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "dag-disp-"));
  created.push(dir);
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "t@example.com"]);
  git(dir, ["config", "user.name", "T"]);
  writeFileSync(join(dir, "README.md"), "# repo\n");
  writeFileSync(join(dir, ".gitignore"), ".worktrees/\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "init"]);
  return dir;
}

/** A spawner that does the node's work for real and reports an outcome. */
class FakeSpawner implements Spawner {
  public constructor(
    private readonly outcome: NodeOutcomeKind = "complete",
    private readonly conflicting = false,
    private readonly file?: string,
  ) {}

  public async spawn(request: SpawnRequest): Promise<NodeReport> {
    if (this.outcome === "complete") {
      const file = this.file ?? (this.conflicting ? "shared.txt" : `${request.node}.txt`);
      writeFileSync(join(request.worktree, file), `${request.node}\n`);
      git(request.worktree, ["add", "."]);
      git(request.worktree, ["commit", "-m", `work ${request.node}`]);
    }
    return { outcome: this.outcome, summary: `${request.node}: ${this.outcome}` };
  }

  public async resolve(request: ResolveRequest): Promise<"resolved" | "blocked"> {
    const files = conflictedFiles(request.repo);
    for (const file of files) git(request.repo, ["checkout", "--theirs", "--", file]);
    if (files.length > 0) git(request.repo, ["add", "--", ...files]);
    git(request.repo, ["commit", "--no-edit"]);
    return "resolved";
  }
}

const independent: NodeDeclaration[] = [
  { id: "n1", content: "first", brief: "VALIDATION: a. ACCEPTANCE: b.", deps: [], policy: "delegate" },
  { id: "n2", content: "second", brief: "VALIDATION: a. ACCEPTANCE: b.", deps: [], policy: "delegate" },
];

function setup(options: { outcome?: NodeOutcomeKind; declarations?: readonly NodeDeclaration[]; spawner?: Spawner } = {}) {
  const repo = tempRepo();
  const store = new DagStore({ append() {} });
  store.declare(options.declarations ?? modelDeclarations());
  const spawner = options.spawner ?? new FakeSpawner(options.outcome ?? "complete");
  return { repo, store, dispatcher: new DagDispatcher(store, repo, spawner) };
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("dag dispatcher", () => {
  it("runs a chain: worktree, spawn, validate, integrate, remove", async () => {
    const { repo, store, dispatcher } = setup();
    expect((await dispatcher.run(["n1"], 1))[0]?.outcome).toBe("integrated");
    expect((await dispatcher.run(["n2"], 1))[0]?.outcome).toBe("integrated");
    expect(store.state.nodes["n1"]?.status).toBe("completed");
    expect(store.state.nodes["n2"]?.gstate).toBe("removed");
    expect(store.violations()).toEqual([]);
    expect(git(repo, ["log", "--oneline"]).split("\n").length).toBeGreaterThanOrEqual(3);
  });

  it("refuses a dependent whose dependency is completed but not integrated", async () => {
    const { store, dispatcher } = setup();
    store.dispatch("n1", { base: "b", worktree: "/wt/n1", branch: "b/n1" });
    store.finishWorktree("n1");
    store.admit("n1");
    store.checkFiles("n1");
    store.settle("n1", "complete", "manual", "commit-n1");
    expect(store.canDispatch("n2")).toBe(false);
    const results = await dispatcher.run(["n2"], 1);
    expect(results[0]?.outcome).toBe("not-ready");
    expect(store.state.nodes["n2"]?.status).toBe("pending");
  });

  it("suspends on blocked and keeps the worktree alive", async () => {
    const { store, dispatcher } = setup({ outcome: "blocked" });
    const results = await dispatcher.run(["n1"], 1);
    expect(results[0]?.outcome).toBe("blocked");
    expect(store.state.nodes["n1"]?.status).toBe("blocked");
    expect(store.state.nodes["n1"]?.gstate).toBe("created");
    expect(store.violations()).toEqual([]);
  });

  it("distinguishes underspecified in the one model", async () => {
    const { store, dispatcher } = setup({ outcome: "underspecified" });
    expect((await dispatcher.run(["n1"], 1))[0]?.outcome).toBe("underspecified");
    expect(store.state.nodes["n1"]?.status).toBe("underspecified");
    expect(store.violations()).toEqual([]);
  });

  it("records a failed spawn without integrating", async () => {
    const { store, dispatcher } = setup({ outcome: "failed" });
    expect((await dispatcher.run(["n1"], 1))[0]?.outcome).toBe("failed");
    expect(store.state.nodes["n1"]?.status).toBe("failed");
    expect(store.violations()).toEqual([]);
  });

  it("resolves a sibling conflict with the node policy", async () => {
    const { repo, store, dispatcher } = setup({ declarations: independent, spawner: new FakeSpawner("complete", true) });
    // One batch: both worktrees branch from the same base, so n2 really conflicts.
    const results = await dispatcher.run(["n1", "n2"], 1);
    expect(results.map((result) => result.outcome)).toEqual(["integrated", "integrated"]);
    expect(store.violations()).toEqual([]);
    expect(readFileSync(join(repo, "shared.txt"), "utf8")).toBe("n2\n");
  });

  it("halts on a conflict when the policy is halt", async () => {
    const halting: NodeDeclaration[] = independent.map((node) => ({ ...node, policy: "halt" as const }));
    const { store, dispatcher } = setup({ declarations: halting, spawner: new FakeSpawner("complete", true) });
    const results = await dispatcher.run(["n1", "n2"], 1);
    expect(results.map((result) => result.outcome)).toEqual(["integrated", "conflicted"]);
    expect(store.state.nodes["n2"]?.gstate).toBe("conflicted");
    expect(store.violations()).toEqual([]);
  });

  it("takes the node side when the policy is theirs", async () => {
    const theirs: NodeDeclaration[] = independent.map((node) => ({ ...node, policy: "theirs" as const }));
    const { repo, store, dispatcher } = setup({ declarations: theirs, spawner: new FakeSpawner("complete", true) });
    const results = await dispatcher.run(["n1", "n2"], 1);
    expect(results.map((result) => result.outcome)).toEqual(["integrated", "integrated"]);
    expect(readFileSync(join(repo, "shared.txt"), "utf8")).toBe("n2\n");
    expect(store.violations()).toEqual([]);
  });

  it("enforces declared file ownership at completion", async () => {
    const declared: NodeDeclaration[] = [
      { id: "n1", content: "x", brief: "VALIDATION: a. ACCEPTANCE: b.", deps: [], files: ["declared.txt"] },
    ];
    const { store, dispatcher } = setup({ declarations: declared, spawner: new FakeSpawner("complete", false, "other.txt") });
    const results = await dispatcher.run(["n1"], 1);
    expect(results[0]?.outcome).toBe("invalid");
    expect(results[0]?.reasons).toContain("touched-undeclared-files");
    expect(store.state.nodes["n1"]?.status).toBe("failed");
    expect(store.violations()).toEqual([]);
  });

  it("accepts a completion inside the declared files", async () => {
    const declared: NodeDeclaration[] = [
      { id: "n1", content: "x", brief: "VALIDATION: a. ACCEPTANCE: b.", deps: [], files: ["declared.txt"] },
    ];
    const { repo, dispatcher } = setup({ declarations: declared, spawner: new FakeSpawner("complete", false, "declared.txt") });
    expect((await dispatcher.run(["n1"], 1))[0]?.outcome).toBe("integrated");
    expect(existsSync(join(repo, "declared.txt"))).toBe(true);
  });

  it("maps a locked git index onto the model instead of throwing", async () => {
    const repo = tempRepo();
    const store = new DagStore({ append() {} });
    store.declare(modelDeclarations());
    const dispatcher = new DagDispatcher(store, repo, new LockingSpawner(repo));
    const results = await dispatcher.run(["n1"], 1);
    expect(results[0]?.outcome).toBe("conflicted");
    expect(results[0]?.reasons.join(" ")).toContain("merge-io-error");
    expect(store.violations()).toEqual([]);
    rmSync(join(repo, ".git/index.lock"), { force: true });
  });

  it("refuses an overlapping dispatch", async () => {
    const repo = tempRepo();
    const store = new DagStore({ append() {} });
    store.declare(modelDeclarations());
    let release: (() => void) | undefined;
    const hanging: Spawner = {
      spawn: () => new Promise<NodeReport>((resolve) => {
        release = () => resolve({ outcome: "blocked", summary: "released" });
      }),
    };
    const dispatcher = new DagDispatcher(store, repo, hanging);
    const first = dispatcher.run(["n1"], 1);
    await expect(dispatcher.run(["n2"], 1)).rejects.toThrow(/already running/);
    release?.();
    await first;
  });

  it("bounds a hung child with a hard timeout", async () => {
    const repo = tempRepo();
    const script = join(repo, "slow.sh");
    writeFileSync(script, "#!/bin/sh\nsleep 30\n");
    chmodSync(script, 0o755);
    const spawner = new PiSpawner(script, 200);
    const report = await spawner.spawn({ node: "n1", brief: "x", worktree: repo, resultPath: join(repo, "r.json"), generation: 1 });
    expect(report.outcome).toBe("failed");
    expect(report.summary).toContain("timeout");
  });
});

/** A spawner that commits a file and then locks the git index. */
class LockingSpawner implements Spawner {
  public constructor(private readonly repo: string) {}

  public async spawn(request: SpawnRequest): Promise<NodeReport> {
    writeFileSync(join(request.worktree, `${request.node}.txt`), `${request.node}\n`);
    git(request.worktree, ["add", "."]);
    git(request.worktree, ["commit", "-m", `work ${request.node}`]);
    // Lock the integration repository's index so the merge fails at the I/O layer.
    writeFileSync(join(this.repo, ".git", "index.lock"), "");
    return { outcome: "complete", summary: "done" };
  }
}
