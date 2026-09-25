/**
 * The wave dispatcher.
 *
 * It performs the git side effects and records their outcomes in the single
 * store. The store's transition relation is the verified `DagSystem` relation,
 * so the dispatcher only decides *when* to invoke git.
 *
 * Every git failure is mapped onto a model transition (see `#gitFailed`), so an
 * I/O error can never escape the verified alphabet; a run is serialized by an
 * in-flight guard; and a spawned child is bounded by a timeout.
 */

import { spawn as spawnProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  abortMerge,
  ensureWorktree,
  GitError,
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
import type { ConflictPolicy, DagNode } from "../engine/state.ts";
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

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The dispatcher. */
export class DagDispatcher {
  readonly #store: DagStore;
  readonly #repo: string;
  readonly #spawner: Spawner;
  #running = false;

  public constructor(store: DagStore, repo: string, spawner: Spawner) {
    this.#store = store;
    this.#repo = repo;
    this.#spawner = spawner;
  }

  /**
   * Dispatch a batch of ready nodes. Spawns are concurrent; settlement is
   * serialized because every settlement may merge into the integration branch.
   * Overlapping runs are refused so settlements cannot interleave.
   */
  public async run(nodes: readonly string[], generation: number): Promise<DispatchResult[]> {
    if (this.#running) throw new Error("a dispatch is already running");
    this.#running = true;
    try {
      const probe = probeRepository(this.#repo);
      if (!probe.ok) throw new Error(`repository root not ready: ${probe.reasons.join(", ")}`);
      const base = revParse(this.#repo, "HEAD");

      const pending: { node: string; report: Promise<NodeReport> }[] = [];
      const notReady: DispatchResult[] = [];
      for (const node of nodes) {
        const declaration = this.#store.state.nodes[node];
        if (declaration === undefined) {
          notReady.push({ node, outcome: "not-ready", reasons: ["unknown-node"], conflicts: [] });
          continue;
        }
        // A recovered node: the worktree and its command survived, the process
        // did not. Re-admit the effect in place instead of re-creating anything.
        if (
          declaration.gstate === "created" &&
          declaration.registered &&
          declaration.cmd === "accepted" &&
          declaration.effect === "idle" &&
          declaration.worktree !== null
        ) {
          this.#store.admit(node);
          pending.push({ node, report: this.#spawn(node, declaration, generation, declaration.worktree) });
          continue;
        }
        // The scheduler may consider a node ready while its dependency is merely
        // core-completed; the model's dispatch guard requires it integrated.
        if (!this.#store.canDispatch(node)) {
          notReady.push({ node, outcome: "not-ready", reasons: ["dependency-not-integrated"], conflicts: [] });
          continue;
        }
        const worktree = worktreePath(this.#repo, generation, node);
        const branch = nodeBranch(generation, node);
        this.#store.dispatch(node, { base, worktree, branch });
        try {
          ensureWorktree(this.#repo, worktree, branch, base, worktreeRoot(this.#repo));
        } catch (error) {
          this.#gitFailed(node, error);
          notReady.push({ node, outcome: "failed", reasons: [`worktree-add-failed: ${message(error)}`], conflicts: [] });
          continue;
        }
        this.#store.finishWorktree(node);
        this.#store.admit(node);
        pending.push({ node, report: this.#spawn(node, declaration, generation, worktree) });
      }

      const results: DispatchResult[] = [...notReady];
      for (const { node, report } of pending) {
        let outcome: NodeReport;
        try {
          outcome = await report;
        } catch (error) {
          outcome = { outcome: "failed", summary: message(error) };
        }
        results.push(await this.#settle(node, outcome));
      }
      return results;
    } finally {
      this.#running = false;
    }
  }

  #spawn(node: string, declaration: DagNode, generation: number, worktree: string): Promise<NodeReport> {
    return this.#spawner.spawn({
      node,
      brief: `${declaration.content}\n\n${declaration.brief}`,
      worktree,
      resultPath: resultPath(worktree),
      generation,
    });
  }

  /**
   * Map an unexpected git failure onto a model transition. The node is either
   * interrupted (before an effect existed), conflicted (mid-merge), or failed
   * (during an effect), so no raw I/O error escapes the alphabet.
   */
  #gitFailed(node: string, error: unknown): void {
    const current = this.#store.state.nodes[node];
    const detail = message(error);
    try {
      if (current?.merging === true) {
        try {
          abortMerge(this.#repo);
        } catch {
          // A stuck merge is surfaced through the conflict state below.
        }
        this.#store.recordConflict(node);
      } else if (current?.status === "starting" || current?.cmd === "accepted") {
        this.#store.apply({ type: "stop", node });
      } else if (current?.effect === "running") {
        this.#store.settle(node, "fail", detail);
      }
    } catch {
      // The failure is surfaced through the returned reasons regardless.
    }
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
    if (declaration.worktree === null || declaration.branch === null) {
      this.#store.settle(node, "fail", "missing-worktree-facts");
      return { node, outcome: "invalid", reasons: ["missing-worktree-facts"], conflicts: [] };
    }
    const base = declaration.base ?? revParse(this.#repo, "HEAD");
    const deps = declaration.deps
      .map((dep) => this.#store.state.nodes[dep]?.mergeCommit ?? this.#store.state.nodes[dep]?.completedCommit)
      .filter((commit): commit is string => typeof commit === "string");
    const check = validateCompletion(this.#repo, declaration.worktree, {
      branch: declaration.branch,
      base,
      deps,
      requireCommit: !declaration.noop,
      files: declaration.files,
    });
    if (!check.ok || check.head === null) {
      this.#store.settle(node, "fail", check.reasons.join(", ") || "invalid-completion");
      return { node, outcome: "invalid", reasons: check.reasons, conflicts: check.conflicts };
    }

    this.#store.checkFiles(node);
    this.#store.settle(node, "complete", report.summary, check.head);
    this.#store.beginMerge(node);

    let merge;
    try {
      merge = integrateCommit(this.#repo, check.head, `dag: ${node}`);
    } catch (error) {
      this.#gitFailed(node, error);
      return { node, outcome: "conflicted", reasons: [`merge-io-error: ${message(error)}`], conflicts: [] };
    }
    if (merge.ok) {
      this.#store.recordMerge(node, revParse(this.#repo, "HEAD"));
      return { node, outcome: "integrated", reasons: this.#removeWorktree(node), conflicts: [] };
    }

    const policy: ConflictPolicy = declaration.policy;
    if (policy === "ours" || policy === "theirs") {
      try {
        const head = resolveMerge(this.#repo, policy);
        this.#store.recordMerge(node, head);
        return { node, outcome: "integrated", reasons: this.#removeWorktree(node), conflicts: [] };
      } catch (error) {
        this.#gitFailed(node, error);
        return { node, outcome: "conflicted", reasons: [`resolve-failed: ${message(error)}`], conflicts: merge.conflicts };
      }
    }
    if (policy === "delegate" && this.#spawner.resolve !== undefined) {
      let resolved: "resolved" | "blocked" = "blocked";
      try {
        resolved = await this.#spawner.resolve({
          node,
          repo: this.#repo,
          brief: `${declaration.content}\n\n${declaration.brief}`,
          conflicts: merge.conflicts,
        });
      } catch (error) {
        resolved = "blocked";
        void error;
      }
      if (resolved === "resolved") {
        this.#store.recordMerge(node, revParse(this.#repo, "HEAD"));
        return { node, outcome: "integrated", reasons: this.#removeWorktree(node), conflicts: [] };
      }
      try {
        abortMerge(this.#repo);
      } catch {
        // Root may already be clean; the conflict is recorded regardless.
      }
      this.#store.recordConflict(node);
      return { node, outcome: "conflicted", reasons: ["resolver-blocked"], conflicts: merge.conflicts };
    }
    abortMerge(this.#repo);
    this.#store.recordConflict(node);
    return { node, outcome: "conflicted", reasons: ["merge-conflict"], conflicts: merge.conflicts };
  }

  /**
   * Remove the worktree after integration. A removal failure leaves the state
   * `integrated` (retryable) and is reported, never silently swallowed.
   */
  #removeWorktree(node: string): string[] {
    const declaration = this.#store.state.nodes[node]!;
    if (declaration.worktree !== null) {
      try {
        removeWorktree(this.#repo, declaration.worktree, worktreeRoot(this.#repo));
      } catch (error) {
        return [`worktree-removal-failed: ${message(error)}`];
      }
    }
    this.#store.removeNode(node);
    return [];
  }
}

/** The default spawner: a nested pi process with a hard timeout. */
export class PiSpawner implements Spawner {
  readonly #pi: string;
  readonly #timeoutMs: number;

  public constructor(pi = "pi", timeoutMs = 30 * 60_000) {
    this.#pi = pi;
    this.#timeoutMs = timeoutMs;
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
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, this.#timeoutMs);
      const finish = (report: NodeReport): void => {
        clearTimeout(timer);
        resolve(report);
      };
      child.on("error", (error) => finish({ outcome: "failed", summary: `spawn-error: ${message(error)}` }));
      child.on("close", (code) => {
        if (timedOut) {
          finish({ outcome: "failed", summary: `timeout after ${this.#timeoutMs}ms` });
          return;
        }
        const report = existsSync(request.resultPath) ? readReport(readFileSync(request.resultPath, "utf8")) : null;
        if (report !== null) {
          finish(report);
          return;
        }
        finish(
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
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, this.#timeoutMs);
      child.on("error", () => {
        clearTimeout(timer);
        resolve("blocked");
      });
      child.on("close", () => {
        clearTimeout(timer);
        if (timedOut) {
          resolve("blocked");
          return;
        }
        resolve(!mergeInProgress(request.repo) && workingTreeClean(request.repo) ? "resolved" : "blocked");
      });
    });
  }
}
