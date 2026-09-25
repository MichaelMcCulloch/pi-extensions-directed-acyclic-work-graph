import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  abortMerge,
  createWorktree,
  git,
  integrateCommit,
  nodeBranch,
  probeRepository,
  removeWorktree,
  removeWorktreeIfIntegrated,
  repairWorktree,
  revParse,
  validateCompletion,
  worktreeRoot,
} from "../src/engine/git.ts";

const created: string[] = [];

function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "dag-git-"));
  created.push(dir);
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "t@example.com"]);
  git(dir, ["config", "user.name", "T"]);
  writeFileSync(join(dir, "README.md"), "# repo\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "init"]);
  return dir;
}

function commitIn(worktree: string, file: string, body: string): void {
  writeFileSync(join(worktree, file), body);
  git(worktree, ["add", "."]);
  git(worktree, ["commit", "-m", `add ${file}`]);
}

function spawn(repo: string, node: string): { path: string; branch: string; base: string } {
  const base = revParse(repo, "HEAD");
  const branch = nodeBranch(1, node);
  const path = join(worktreeRoot(repo), "g1", node);
  createWorktree(repo, path, branch, base);
  return { path, branch, base };
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("git engine", () => {
  it("probes a clean repository", () => {
    const repo = tempRepo();
    const probe = probeRepository(repo);
    expect(probe.ok).toBe(true);
    expect(probe.branch).toBe("main");
    expect(probe.clean).toBe(true);
  });

  it("refuses to open a wave on a dirty root", () => {
    const repo = tempRepo();
    writeFileSync(join(repo, "dirty.txt"), "x");
    const probe = probeRepository(repo);
    expect(probe.ok).toBe(false);
    expect(probe.reasons).toContain("dirty-root");
  });

  it("validates a completion and fast-forwards it into root", () => {
    const repo = tempRepo();
    const node = spawn(repo, "n1");
    commitIn(node.path, "a.txt", "a\n");
    const check = validateCompletion(repo, node.path, {
      branch: node.branch,
      base: node.base,
      deps: [],
      requireCommit: true,
    });
    expect(check.ok).toBe(true);
    expect(check.ahead).toBe(1);

    const merged = integrateCommit(repo, check.head!, "dag: n1");
    expect(merged.ok).toBe(true);
    expect(merged.fastForward).toBe(true);
    expect(existsSync(join(repo, "a.txt"))).toBe(true);

    removeWorktreeIfIntegrated(repo, node.path, worktreeRoot(repo), revParse(repo, "HEAD"));
    expect(existsSync(node.path)).toBe(false);
  });

  it("refuses to remove an unintegrated worktree", () => {
    const repo = tempRepo();
    const node = spawn(repo, "n1");
    commitIn(node.path, "a.txt", "a\n");
    expect(() => removeWorktreeIfIntegrated(repo, node.path, worktreeRoot(repo), revParse(repo, "HEAD"))).toThrow(
      /not integrated/,
    );
  });

  it("reports and aborts a conflicted merge", () => {
    const repo = tempRepo();
    const first = spawn(repo, "n1");
    const second = spawn(repo, "n2");
    commitIn(first.path, "shared.txt", "one\n");
    commitIn(second.path, "shared.txt", "two\n");

    const c1 = validateCompletion(repo, first.path, { branch: first.branch, base: first.base, deps: [], requireCommit: true });
    expect(integrateCommit(repo, c1.head!, "dag: n1").ok).toBe(true);

    const c2 = validateCompletion(repo, second.path, { branch: second.branch, base: second.base, deps: [], requireCommit: true });
    const merged = integrateCommit(repo, c2.head!, "dag: n2");
    expect(merged.ok).toBe(false);
    expect(merged.conflicts).toContain("shared.txt");
    abortMerge(repo);
    // Root is usable again and still holds the first node's work.
    expect(existsSync(join(repo, "shared.txt"))).toBe(true);
    expect(probeRepository(repo).clean).toBe(true);
  });

  it("treats an already-integrated commit as a no-op", () => {
    const repo = tempRepo();
    const node = spawn(repo, "n1");
    commitIn(node.path, "a.txt", "a\n");
    const check = validateCompletion(repo, node.path, { branch: node.branch, base: node.base, deps: [], requireCommit: true });
    expect(integrateCommit(repo, check.head!, "dag: n1").ok).toBe(true);
    const again = integrateCommit(repo, check.head!, "dag: n1");
    expect(again.ok).toBe(true);
    expect(again.conflicts).toEqual([]);
  });

  it("requires a commit ahead unless the node is a no-op", () => {
    const repo = tempRepo();
    const node = spawn(repo, "n1");
    const check = validateCompletion(repo, node.path, { branch: node.branch, base: node.base, deps: [], requireCommit: true });
    expect(check.ok).toBe(false);
    expect(check.reasons).toContain("no-commit-ahead");
    const noop = validateCompletion(repo, node.path, { branch: node.branch, base: node.base, deps: [], requireCommit: false });
    expect(noop.ok).toBe(true);
  });

  it("requires declared dependency commits to be ancestors", () => {
    const repo = tempRepo();
    const dep = spawn(repo, "dep");
    commitIn(dep.path, "dep.txt", "d\n");
    const depHead = validateCompletion(repo, dep.path, { branch: dep.branch, base: dep.base, deps: [], requireCommit: true }).head!;

    // A second worktree based on the same root does not contain the dep commit.
    const node = spawn(repo, "n1");
    commitIn(node.path, "n.txt", "n\n");
    const check = validateCompletion(repo, node.path, { branch: node.branch, base: node.base, deps: [depHead], requireCommit: true });
    expect(check.ok).toBe(false);
    expect(check.reasons.some((reason) => reason.startsWith("missing-dep:"))).toBe(true);
  });

  it("repairs a stranded worktree path", () => {
    const repo = tempRepo();
    const base = revParse(repo, "HEAD");
    const branch = nodeBranch(1, "n1");
    const path = join(worktreeRoot(repo), "g1", "n1");
    // Simulate an interrupted `worktree add`: a directory exists, unregistered.
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, "residue.txt"), "stale");
    repairWorktree(repo, path, branch, base, worktreeRoot(repo));
    expect(git(path, ["symbolic-ref", "--short", "HEAD"])).toBe(branch);
    expect(existsSync(join(path, "residue.txt"))).toBe(false);
    removeWorktree(repo, path, worktreeRoot(repo));
    expect(existsSync(path)).toBe(false);
  });
});
