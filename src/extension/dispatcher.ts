/**
 * The wave dispatcher.
 *
 * It performs the git side effects and records their outcomes in the single
 * store. The store's transition relation is the verified `DagSystem` relation,
 * so the dispatcher only decides *when* to invoke git; the state machine that
 * spans the scheduler and worktree domains is the verified one.
 */

import { spawn as spawnProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  abortMerge,
  ensureWorktree,
  integrateCommit,
  mergeInProgress,
  nodeBranch,
  probeRepository,
  removeWorktree,
  resolveMerge,
  revParse,
  sanitize,
  validateCompletion,
  workingTreeClean,
  worktreeRoot,
} from "../engine/git.ts";
import type { ConflictPolicy } from "../engine/state.ts";
import { readReport } from "./dag-report.ts";
import type { DagStore } from "./store.ts";

/** The outcome a node agent reports. */
export type NodeOutcomeKind = "complete" | "blocked" | "underspecified" | "failed";

/** The structured report a node agent produces. */
export interface NodeReport {
  readonly outcome: NodeOutcomeKind;
  readonly summary: string;
}

/** What the spawner needs to start one node agent. */
export interface SpawnRequest {
  readonly node: string;
  readonly brief: string;
  readonly worktree: string;
  readonly resultPath: string;
  readonly generation: number;
}

/** What a resolver needs to finish a delegated merge. */
export interface ResolveRequest {
  readonly node: string;
  readonly repo: string;
  readonly brief: string;
  readonly conflicts: readonly string[];
}

/** How the dispatcher starts agents. Replaceable in tests. */
export interface Spawner {
  spawn(request: SpawnRequest): Promise<NodeReport>;
  resolve?(request: ResolveRequest): Promise<"resolved" | "blocked">;
}

/** The disposition of one dispatched node. */
export interface DispatchResult {
  readonly node: string;
  readonly outcome: "integrated" | NodeOutcomeKind | "conflicted" | "invalid" | "not-ready";
  readonly reasons: readonly string[];
  readonly conflicts: readonly string[];
}

/** The result file a node agent writes. It sits beside the worktree. */
export function resultPath(worktree: string): string {
  return `${worktree}.result.json`;
}

/** The worktree path for a node generation. */
export function worktreePath(repo: string, generation: number, node: string): string {
  return join(worktreeRoot(repo), `g${generation}`, sanitize(node));
}

/** The dispatcher. */
export class DagDispatcher {
  readonly #store: DagStore;
  readonly #repo: string;
  readonly #spawner: Spawner;

  public constructor(store: DagStore, repo: string, spawner: Spawner) {
    this.#store = store;
    this.#repo = repo;
    this.#spawner = spawner;
  }

  /**
   * Dispatch a batch of ready nodes. Spawns are concurrent; settlement is
   * serialized because every settlement may merge into the integration branch.
   */
  public async run(nodes: readonly string[], generation: number): Promise<DispatchResult[]> {
    const probe = probeRepository(this.#repo);
    if (!probe.ok) throw new Error(`repository root not ready: ${probe.reasons.join(", ")}`);
    const base = revParse(this.#repo, "HEAD");

    const pending: { node: string; report: Promise<NodeReport> }[] = [];
    const notReady: DispatchResult[] = [];
    for (const node of nodes) {
      // The scheduler may consider a node ready while its dependency is merely
      // core-completed; the model's dispatch guard requires it integrated.
      if (!this.#store.canDispatch(node)) {
        notReady.push({ node, outcome: "not-ready", reasons: ["dependency-not-integrated"], conflicts: [] });
        continue;
      }
      const worktree = worktreePath(this.#repo, generation, node);
      const branch = nodeBranch(generation, node);
      this.#store.dispatch(node, { base, worktree, branch });
      ensureWorktree(this.#repo, worktree, branch, base, worktreeRoot(this.#repo));
      this.#store.finishWorktree(node);
      this.#store.admit(node);
      const declaration = this.#store.state.nodes[node]!;
      pending.push({
        node,
        report: this.#spawner.spawn({
          node,
          brief: `${declaration.content}\n\n${declaration.brief}`,
          worktree,
          resultPath: resultPath(worktree),
          generation,
        }),
      });
    }

    const results: DispatchResult[] = [...notReady];
    for (const { node, report } of pending) {
      let outcome: NodeReport;
      try {
        outcome = await report;
      } catch (error) {
        outcome = { outcome: "failed", summary: error instanceof Error ? error.message : String(error) };
      }
      results.push(await this.#settle(node, outcome));
    }
    return results;
  }

  async #settle(node: string, report: NodeReport): Promise<DispatchResult> {
    if (report.outcome === "blocked" || report.outcome === "underspecified") {
      this.#store.settle(node, report.outcome === "blocked" ? "block" : "underspecify", report.summary);
      return { node, outcome: report.outcome, reasons: [report.summary], conflicts: [] };
    }
    if (report.outcome === "failed") {
      this.#store.settle(node, "fail", report.summary);
      return { node, outcome: "failed", reasons: [report.summary], conflicts: [] };
    }

    const declaration = this.#store.state.nodes[node]!;
    const base = declaration.base ?? revParse(this.#repo, "HEAD");
    const deps = declaration.deps
      .map((dep) => this.#store.state.nodes[dep]?.mergeCommit ?? this.#store.state.nodes[dep]?.completedCommit)
      .filter((commit): commit is string => typeof commit === "string");
    const check = validateCompletion(this.#repo, declaration.worktree!, {
      branch: declaration.branch!,
      base,
      deps,
      requireCommit: !declaration.noop,
    });
    if (!check.ok || check.head === null) {
      return { node, outcome: "invalid", reasons: check.reasons, conflicts: check.conflicts };
    }

    this.#store.settle(node, "complete", report.summary, check.head);
    this.#store.beginMerge(node);
    const merge = integrateCommit(this.#repo, check.head, `dag: ${node}`);
    if (merge.ok) {
      this.#store.recordMerge(node, revParse(this.#repo, "HEAD"));
      this.#removeWorktree(node);
      return { node, outcome: "integrated", reasons: [], conflicts: [] };
    }

    const policy: ConflictPolicy = declaration.policy;
    if (policy === "ours" || policy === "theirs") {
      const head = resolveMerge(this.#repo, policy);
      this.#store.recordMerge(node, head);
      this.#removeWorktree(node);
      return { node, outcome: "integrated", reasons: [], conflicts: [] };
    }
    if (policy === "delegate" && this.#spawner.resolve !== undefined) {
      const resolved = await this.#spawner.resolve({
        node,
        repo: this.#repo,
        brief: `${declaration.content}\n\n${declaration.brief}`,
        conflicts: merge.conflicts,
      });
      if (resolved === "resolved") {
        this.#store.recordMerge(node, revParse(this.#repo, "HEAD"));
        this.#removeWorktree(node);
        return { node, outcome: "integrated", reasons: [], conflicts: [] };
      }
      abortMerge(this.#repo);
      this.#store.recordConflict(node);
      return { node, outcome: "conflicted", reasons: ["resolver-blocked"], conflicts: merge.conflicts };
    }
    abortMerge(this.#repo);
    this.#store.recordConflict(node);
    return { node, outcome: "conflicted", reasons: ["merge-conflict"], conflicts: merge.conflicts };
  }

  #removeWorktree(node: string): void {
    const declaration = this.#store.state.nodes[node]!;
    if (declaration.worktree !== null) {
      removeWorktree(this.#repo, declaration.worktree, worktreeRoot(this.#repo));
    }
    this.#store.removeNode(node);
  }
}

/**
 * The default spawner: a nested pi process.
 *
 * A node runs in its worktree and writes its structured report to `DAG_RESULT`.
 * A resolver runs in the repository root, where the delegated merge is in
 * progress, and is judged by the git state rather than by a report.
 */
export class PiSpawner implements Spawner {
  readonly #pi: string;

  public constructor(pi = "pi") {
    this.#pi = pi;
  }

  public spawn(request: SpawnRequest): Promise<NodeReport> {
    const prompt = [
      `You are DAG node "${request.node}". Work only inside the current worktree.`,
      request.brief,
      "When finished, call dag_report with outcome complete, blocked, or underspecified, then stop.",
      "Commit your work before reporting complete.",
    ].join("\n\n");
    return new Promise<NodeReport>((resolve) => {
      const child = spawnProcess(this.#pi, ["-p", prompt], {
        cwd: request.worktree,
        env: { ...process.env, DAG_NODE: request.node, DAG_RESULT: request.resultPath },
        stdio: "ignore",
      });
      child.on("close", (code) => {
        const report = existsSync(request.resultPath) ? readReport(readFileSync(request.resultPath, "utf8")) : null;
        if (report !== null) {
          resolve(report);
          return;
        }
        resolve(
          code === 0
            ? { outcome: "blocked", summary: "child exited without a dag_report; treated as blocked" }
            : { outcome: "failed", summary: `child exited with code ${code ?? "signal"}` },
        );
      });
    });
  }

  public resolve(request: ResolveRequest): Promise<"resolved" | "blocked"> {
    const prompt = [
      `You are a DAG merge resolver for node "${request.node}".`,
      "A git merge is in progress in this repository and conflicts in:",
      ...request.conflicts.map((file) => `  - ${file}`),
      "Original node intent:",
      request.brief,
      "Resolve every conflict, preserving both intents where possible. Then `git add` the files and `git commit` to finish the merge. Do not abort the merge.",
    ].join("\n\n");
    return new Promise<"resolved" | "blocked">((resolve) => {
      const child = spawnProcess(this.#pi, ["-p", prompt], { cwd: request.repo, stdio: "ignore" });
      child.on("close", () => {
        resolve(!mergeInProgress(request.repo) && workingTreeClean(request.repo) ? "resolved" : "blocked");
      });
    });
  }
}
