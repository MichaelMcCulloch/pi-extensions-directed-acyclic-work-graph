/**
 * Durable state for the single DAG machine.
 *
 * The production state extends the composed abstract state
 * (`src/formal/system-model.ts`, the mirror of `spec/DagSystem.tla`): every
 * scheduler field and every worktree field is carried on the node, so
 * `abstractSystemState` is a pure projection and the production reducer applies
 * the verified transition relation itself rather than asserting against it.
 *
 * Git facts (the worktree path, branch, base, and recorded commits) are durable
 * observations of the workspace; the machine fields are the verified state.
 */

import type { GitPhase, SystemStatus } from "../formal/system-model.ts";

/** A node identifier. Declaration order is the durable priority order. */
export type NodeId = string;

/** Whether a node produces work or integrates dependency work. */
export type NodeKind = "task" | "integration";

/** How a merge conflict is handled. */
export type ConflictPolicy = "delegate" | "ours" | "theirs" | "halt";

/** The scheduler command slot. */
export type CommandState = "none" | "accepted";

/** The process-local effect slot. */
export type EffectState = "idle" | "running";

/** One node's durable declaration. */
export interface NodeDeclaration {
  readonly id: NodeId;
  readonly content: string;
  readonly brief: string;
  readonly deps: readonly NodeId[];
  readonly kind?: NodeKind;
  readonly files?: readonly string[];
  readonly policy?: ConflictPolicy;
  /** A node that legitimately produces no commit (e.g. a verification node). */
  readonly noop?: boolean;
}

/** A declared node and its slice of the composed machine. */
export interface DagNode {
  // Declaration
  readonly id: NodeId;
  readonly content: string;
  readonly brief: string;
  readonly deps: readonly NodeId[];
  readonly kind: NodeKind;
  readonly files: readonly string[];
  readonly policy: ConflictPolicy;
  readonly noop: boolean;
  // Scheduler machine
  readonly status: SystemStatus;
  readonly gen: number;
  readonly cmd: CommandState;
  readonly effect: EffectState;
  readonly effectFence: number;
  readonly completedGen: number;
  // Worktree/integration machine
  readonly gstate: GitPhase;
  readonly committed: boolean;
  readonly integrated: boolean;
  readonly registered: boolean;
  readonly merging: boolean;
  /** The dispatcher validated the completion commit against the declared files. */
  readonly checked: boolean;
  // Git facts (durable workspace observations)
  readonly worktree: string | null;
  readonly branch: string | null;
  readonly base: string | null;
  readonly completedCommit: string | null;
  readonly mergeCommit: string | null;
}

/** One accepted transition, for audit and for the trace corpus. */
export interface DagReceipt {
  readonly revision: number;
  readonly operationId: string;
  readonly action: string;
  readonly node: NodeId | null;
}

/** The complete durable state. */
export interface DagState {
  readonly revision: number;
  readonly operationCounter: number;
  readonly order: readonly NodeId[];
  readonly nodes: Readonly<Record<NodeId, DagNode>>;
  /** Stale effects dropped by the fence. */
  readonly droppedEffects: number;
  readonly receipts: readonly DagReceipt[];
}

/** A fresh project with no declared nodes. */
export function initDagState(): DagState {
  return { revision: 0, operationCounter: 0, order: [], nodes: {}, droppedEffects: 0, receipts: [] };
}

/** The declared node ids in declaration order. */
export function nodeIds(state: DagState): readonly NodeId[] {
  return state.order;
}

/** Validate a declaration before it is stored. */
export function validateDeclaration(state: DagState, declaration: readonly NodeDeclaration[]): string[] {
  const errors: string[] = [];
  const ids = declaration.map((node) => node.id);
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) errors.push("duplicate node id");

  for (const node of declaration) {
    if (node.id.length === 0) errors.push("empty node id");
    if (node.content.trim().length === 0) errors.push(`${node.id}: empty content`);
    if (!node.brief.includes("VALIDATION:")) errors.push(`${node.id}: brief missing VALIDATION:`);
    if (!node.brief.includes("ACCEPTANCE:")) errors.push(`${node.id}: brief missing ACCEPTANCE:`);
    for (const dep of node.deps) {
      if (dep === node.id) errors.push(`${node.id}: self dependency`);
      else if (!idSet.has(dep)) errors.push(`${node.id}: unknown dependency ${dep}`);
    }
  }

  const temporary = new Set<NodeId>();
  const permanent = new Set<NodeId>();
  const byId = new Map(declaration.map((node) => [node.id, node]));
  const visit = (id: NodeId): void => {
    if (permanent.has(id)) return;
    if (temporary.has(id)) {
      errors.push(`cycle through ${id}`);
      return;
    }
    temporary.add(id);
    for (const dep of byId.get(id)?.deps ?? []) visit(dep);
    temporary.delete(id);
    permanent.add(id);
  };
  for (const id of ids) visit(id);

  // Declared file ownership is exclusive across the declaration: parallel nodes
  // merge into one integration branch, so overlapping claims would silently
  // overwrite each other at merge time. The composed model checks this as an
  // invariant; this validator is the admitting gate.
  const fileOwners = new Map<string, string[]>();
  for (const node of declaration) {
    for (const file of node.files ?? []) fileOwners.set(file, [...(fileOwners.get(file) ?? []), node.id]);
  }
  for (const [file, owners] of fileOwners) {
    if (owners.length > 1) errors.push(`declared-files-overlap: ${file} is claimed by ${owners.join(", ")}`);
  }

  for (const node of declaration) {
    const existing = state.nodes[node.id];
    if (existing === undefined) continue;
    if (node.policy !== undefined && !["delegate", "ours", "theirs", "halt"].includes(node.policy)) {
      errors.push(`${node.id}: unknown conflict policy ${node.policy}`);
    }
    const changedDeclaration =
      existing.content !== node.content ||
      existing.brief !== node.brief ||
      existing.kind !== (node.kind ?? existing.kind) ||
      existing.policy !== (node.policy ?? existing.policy) ||
      existing.noop !== (node.noop ?? existing.noop) ||
      !sameSet(existing.files, node.files ?? existing.files);
    const changedDeps = !sameSet(existing.deps, node.deps);
    if (existing.status !== "pending" && (changedDeclaration || changedDeps)) {
      errors.push(`${node.id}: cannot change a non-pending node`);
    }
  }

  for (const node of declaration) {
    for (const dep of node.deps) if (!idSet.has(dep)) errors.push(`${node.id}: dependency ${dep} is removed`);
  }
  for (const id of Object.keys(state.nodes)) {
    if (idSet.has(id)) continue;
    for (const node of declaration) {
      if (node.deps.includes(id)) errors.push(`${node.id}: dependency ${id} is removed`);
    }
  }
  return errors;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

/** Order ids so every node follows its dependencies; stable by declaration. */
export function topologicalOrder(declaration: readonly NodeDeclaration[]): NodeId[] {
  const byId = new Map(declaration.map((node) => [node.id, node]));
  const done = new Set<NodeId>();
  const out: NodeId[] = [];
  const visit = (id: NodeId): void => {
    if (done.has(id)) return;
    done.add(id);
    for (const dep of byId.get(id)?.deps ?? []) visit(dep);
    out.push(id);
  };
  for (const node of declaration) visit(node.id);
  return out;
}

/** The initial machine slice of a freshly declared node. */
function initialMachine(node: NodeDeclaration, existing: DagNode | undefined): Omit<DagNode, "id" | "content" | "brief" | "deps" | "kind" | "files" | "policy" | "noop"> {
  if (existing !== undefined) {
    return {
      status: existing.status,
      gen: existing.gen,
      cmd: existing.cmd,
      effect: existing.effect,
      effectFence: existing.effectFence,
      completedGen: existing.completedGen,
      gstate: existing.gstate,
      committed: existing.committed,
      integrated: existing.integrated,
      registered: existing.registered,
      merging: existing.merging,
      checked: existing.checked,
      worktree: existing.worktree,
      branch: existing.branch,
      base: existing.base,
      completedCommit: existing.completedCommit,
      mergeCommit: existing.mergeCommit,
    };
  }
  void node;
  return {
    status: "pending",
    gen: 0,
    cmd: "none",
    effect: "idle",
    effectFence: 0,
    completedGen: 0,
    gstate: "absent",
    committed: false,
    integrated: false,
    registered: false,
    merging: false,
    checked: false,
    worktree: null,
    branch: null,
    base: null,
    completedCommit: null,
    mergeCommit: null,
  };
}

/** Apply a validated declaration, preserving every surviving machine field. */
export function applyDeclaration(state: DagState, declaration: readonly NodeDeclaration[]): DagState {
  const nodes: Record<NodeId, DagNode> = {};
  for (const spec of declaration) {
    const existing = state.nodes[spec.id];
    nodes[spec.id] = {
      id: spec.id,
      content: spec.content,
      brief: spec.brief,
      deps: [...spec.deps],
      kind: spec.kind ?? existing?.kind ?? "task",
      files: [...(spec.files ?? existing?.files ?? [])],
      policy:
        spec.policy ??
        existing?.policy ??
        ((spec.kind ?? existing?.kind ?? "task") === "integration" ? "delegate" : "halt"),
      noop: spec.noop ?? existing?.noop ?? false,
      ...initialMachine(spec, existing),
    };
  }
  return { ...state, nodes, order: topologicalOrder(declaration) };
}
