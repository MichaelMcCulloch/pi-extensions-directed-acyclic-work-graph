/**
 * The git engine.
 *
 * Every operation is an exact `git` argument array through the OS process
 * boundary — no shell, no reimplementation of git. This module owns the git
 * half of the design in DESIGN-worktrees.md:
 *
 *  - probe a repository before a wave (clean, symbolic branch, valid HEAD);
 *  - create and inspect node worktrees under the worktree root;
 *  - validate a completion (branch, clean, no merge, deps ancestors, ahead);
 *  - integrate with `--ff-only` when possible, else `--no-ff`, idempotently;
 *  - remove a worktree only after its commit is an ancestor of the branch, and
 *    repair a path that exists without a registration.
 *
 * The formal counterpart is spec/DagSystem.tla and src/formal/system-model.ts;
 * production records the outcomes as model events.
 */

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve, sep } from "node:path";

/** A git failure carrying the command and stderr. */
export class GitError extends Error {
  public constructor(
    public readonly args: readonly string[],
    public readonly stderr: string,
    message: string,
  ) {
    super(message);
    this.name = "GitError";
  }
}

/** Run git in a directory and return stdout. Never uses a shell. */
export function git(cwd: string, args: readonly string[]): string {
  try {
    return execFileSync("git", [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? String(error);
    throw new GitError(args, stderr, `git ${args.join(" ")} failed: ${stderr.trim()}`);
  }
}

/** Run git and return null instead of throwing. */
function tryGit(cwd: string, args: readonly string[]): string | null {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

/** The state of a repository root before a wave opens. */
export interface RepoProbe {
  readonly ok: boolean;
  readonly branch: string | null;
  readonly head: string | null;
  readonly clean: boolean;
  readonly reasons: readonly string[];
}

/** Probe a repository root: clean, on a symbolic branch, valid HEAD. */
export function probeRepository(repo: string): RepoProbe {
  const reasons: string[] = [];
  if (tryGit(repo, ["rev-parse", "--git-dir"]) === null) reasons.push("not-a-repository");
  const branch = tryGit(repo, ["symbolic-ref", "--short", "-q", "HEAD"]);
  if (branch === null) reasons.push("detached-head");
  const head = tryGit(repo, ["rev-parse", "HEAD"]);
  if (head === null) reasons.push("no-head");
  // The dag's own worktree root is not dirt; `.worktrees/` should also be gitignored.
  const dirty = tryGit(repo, ["status", "--porcelain", "--", ".", ":(exclude).worktrees"]);
  const clean = dirty !== null && dirty.length === 0;
  if (!clean) reasons.push("dirty-root");
  return { ok: reasons.length === 0, branch, head, clean, reasons };
}

/** The HEAD of a branch or commit in a repository. */
export function revParse(repo: string, ref: string): string {
  return git(repo, ["rev-parse", ref]);
}

/** True when `ancestor` is an ancestor of `descendant`. */
export function isAncestor(repo: string, ancestor: string, descendant: string): boolean {
  return tryGit(repo, ["merge-base", "--is-ancestor", ancestor, descendant]) !== null;
}

/** Create a node worktree at `path` on a new branch from `base`. */
export function createWorktree(repo: string, path: string, branch: string, base: string): void {
  git(repo, ["worktree", "add", "-b", branch, path, base]);
}

/** Remove a worktree registration and its directory after integration. */
export function removeWorktree(repo: string, path: string, worktreeRoot: string): void {
  const inside = resolve(path).startsWith(resolve(worktreeRoot) + sep);
  if (!inside) throw new GitError([], "", `refusing to delete outside the worktree root: ${path}`);
  try {
    git(repo, ["worktree", "remove", "--force", path]);
  } catch {
    // A directory left without a registration: remove the residue and prune.
    if (existsSync(path)) rmSync(path, { recursive: true, force: true });
    git(repo, ["worktree", "prune"]);
  }
}

/**
 * Remove a worktree only after its HEAD is an ancestor of `integratedInto`.
 * This is the runtime enforcement of the model's `NoLostWork`.
 */
export function removeWorktreeIfIntegrated(
  repo: string,
  path: string,
  worktreeRoot: string,
  integratedInto: string,
): void {
  if (!existsSync(path)) return;
  const head = revParse(repo, "HEAD");
  void head;
  const worktreeHead = tryGit(path, ["rev-parse", "HEAD"]);
  if (worktreeHead !== null && !isAncestor(repo, worktreeHead, integratedInto)) {
    throw new GitError([], "", `refusing to remove ${path}: its HEAD is not integrated into ${integratedInto}`);
  }
  removeWorktree(repo, path, worktreeRoot);
}

/** True when a local branch exists. */
export function branchExists(repo: string, branch: string): boolean {
  return tryGit(repo, ["rev-parse", "--verify", `refs/heads/${branch}`]) !== null;
}

/**
 * Make a worktree exist at `path` on `branch`. Idempotent: it prunes a stale
 * registration, removes residue under the worktree root, and reuses an existing
 * branch (so a repair never discards the commits a worktree already produced).
 */
export function ensureWorktree(
  repo: string,
  path: string,
  branch: string,
  base: string,
  worktreeRoot: string,
): void {
  const inside = resolve(path).startsWith(resolve(worktreeRoot) + sep);
  if (!inside) throw new GitError([], "", `refusing to touch outside the worktree root: ${path}`);
  git(repo, ["worktree", "prune"]);
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
  if (branchExists(repo, branch)) git(repo, ["worktree", "add", path, branch]);
  else createWorktree(repo, path, branch, base);
}

/** Repair a worktree path that exists without a registered worktree. */
export function repairWorktree(repo: string, path: string, branch: string, base: string, worktreeRoot: string): void {
  ensureWorktree(repo, path, branch, base, worktreeRoot);
}

/** The result of checking a node's worktree against its completion contract. */
export interface CompletionCheck {
  readonly ok: boolean;
  readonly head: string | null;
  readonly ahead: number;
  readonly conflicts: readonly string[];
  readonly reasons: readonly string[];
}

/** Validate completion against the node base, not the integration head. */
export function validateCompletion(
  repo: string,
  worktree: string,
  contract: {
    readonly branch: string;
    readonly base: string;
    readonly deps: readonly string[];
    readonly requireCommit: boolean;
  },
): CompletionCheck {
  const reasons: string[] = [];
  if (!existsSync(worktree)) {
    return { ok: false, head: null, ahead: 0, conflicts: [], reasons: ["missing-worktree"] };
  }
  const branch = tryGit(worktree, ["symbolic-ref", "--short", "-q", "HEAD"]);
  if (branch !== contract.branch) reasons.push("wrong-branch");
  const conflicts = (tryGit(worktree, ["diff", "--name-only", "--diff-filter=U"]) ?? "")
    .split("\n")
    .filter((line) => line.length > 0);
  if (conflicts.length > 0) reasons.push("merge-in-progress");
  if (tryGit(worktree, ["status", "--porcelain"]) !== "") reasons.push("dirty-worktree");
  const head = tryGit(worktree, ["rev-parse", "HEAD"]);
  if (head === null) reasons.push("no-head");
  for (const dep of contract.deps) {
    if (head !== null && !isAncestor(repo, dep, head)) reasons.push(`missing-dep:${dep.slice(0, 8)}`);
  }
  let ahead = 0;
  if (head !== null) {
    const count = tryGit(worktree, ["rev-list", "--count", `${contract.base}..HEAD`]);
    ahead = count === null ? 0 : Number(count);
    if (contract.requireCommit && ahead < 1) reasons.push("no-commit-ahead");
  }
  return { ok: reasons.length === 0, head, ahead, conflicts, reasons };
}

/** The result of integrating one node commit into the integration branch. */
export interface MergeResult {
  readonly ok: boolean;
  readonly fastForward: boolean;
  readonly conflicts: readonly string[];
}

/**
 * Integrate a completed commit into the current branch.
 *
 * `--ff-only` when the branch has not moved, else `--no-ff` with a message that
 * names the node. A commit already reachable from HEAD is a no-op, which makes
 * retrying an interrupted merge safe.
 */
export function integrateCommit(repo: string, commit: string, message: string): MergeResult {
  const head = revParse(repo, "HEAD");
  if (isAncestor(repo, commit, head)) return { ok: true, fastForward: true, conflicts: [] };
  const ff = tryGit(repo, ["merge", "--ff-only", commit]);
  if (ff !== null) return { ok: true, fastForward: true, conflicts: [] };
  try {
    git(repo, ["merge", "--no-ff", "-m", message, commit]);
    return { ok: true, fastForward: false, conflicts: [] };
  } catch (error) {
    const conflicts = (tryGit(repo, ["diff", "--name-only", "--diff-filter=U"]) ?? "")
      .split("\n")
      .filter((line) => line.length > 0);
    if (conflicts.length === 0) throw error;
    return { ok: false, fastForward: false, conflicts };
  }
}

/** Abort an in-progress merge, leaving the worktree at its pre-merge state. */
export function abortMerge(repo: string): void {
  git(repo, ["merge", "--abort"]);
}

/** True when a merge is in progress. */
export function mergeInProgress(repo: string): boolean {
  return tryGit(repo, ["rev-parse", "-q", "--verify", "MERGE_HEAD"]) !== null;
}

/** True when the tracked worktree is clean (the dag's own worktrees excluded). */
export function workingTreeClean(repo: string): boolean {
  return (tryGit(repo, ["status", "--porcelain", "--", ".", ":(exclude).worktrees"]) ?? "x").length === 0;
}

/**
 * Resolve an in-progress merge by taking one side for every conflicted file,
 * then commit the merge. `ours` and `theirs` name the integration head and the
 * incoming node commit respectively, as git does.
 */
export function resolveMerge(repo: string, strategy: "ours" | "theirs"): string {
  const files = conflictedFiles(repo);
  for (const file of files) git(repo, ["checkout", `--${strategy}`, "--", file]);
  if (files.length > 0) git(repo, ["add", "--", ...files]);
  git(repo, ["commit", "--no-edit"]);
  return revParse(repo, "HEAD");
}

/** The file paths currently in conflict. */
export function conflictedFiles(repo: string): string[] {
  return (tryGit(repo, ["diff", "--name-only", "--diff-filter=U"]) ?? "")
    .split("\n")
    .filter((line) => line.length > 0);
}

/** The conventional worktree root inside a repository. */
export function worktreeRoot(repo: string): string {
  return resolve(repo, ".worktrees");
}

/** A branch name for a node, namespaced and generation-scoped. */
export function nodeBranch(generation: number, node: string): string {
  return `dsh/dag/${generation}/${sanitize(node)}`;
}

/** Sanitize a node id for use as a path and branch component. */
export function sanitize(node: string): string {
  return node.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[-.]+/, "_") || "node";
}
