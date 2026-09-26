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
 *
 * Declaration is a *synchronous, idempotent* layer: `write` merges by node id
 * and retains absent nodes as `orphaned`, so re-declaring the full graph is
 * safe at any time. Definition changes to a node that has already left pending
 * mark it `stale` (never silently reset). The store applies the resulting
 * `declare`/`adopt`/`orphan`/`amend`/`mark-stale` events through the verified
 * relation, so this build-up is still checked against `Inv`.
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
  // Declaration membership (verified model state)
  readonly declared: boolean;
  /** Removed from the active declaration but retained with its lifecycle state. */
  readonly orphaned: boolean;
  /** Why the node was manually parked, or null. Observation only. */
  readonly blockedReason: string | null;
  /** Why the node was marked stale by a definition change, or null. */
  readonly staleReason: string | null;
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

/**
 * Repair a snapshot written by an older revision of the model.
 *
 * The machine fields were added incrementally. A snapshot from before the
 * worktree/integration and declared-file-check revisions can contain nodes that
 * are `completed` but carry no `committed`/`registered`/`gstate`/`checked`,
 * and nodes that were dispatched before the dependency-integration coupling
 * existed. Grandfather exactly the facts the old transitions implied so that
 * the recovered state satisfies the current invariant; present values are kept.
 * This is a migration, not a verification shortcut: the synthesized values are
 * what the old model meant by completion (a commit, a worktree, a check).
 */
export function normalizeDagState(state: DagState): DagState {
  const nodes: Record<NodeId, DagNode> = {};
  for (const id of state.order) {
    const node = state.nodes[id];
    if (node === undefined) continue;
    const status = node.status ?? "pending";
    const gen = node.gen ?? 0;
    const completed = status === "completed";
    const dispatched = status !== "pending";
    const integrated = node.integrated ?? false;
    const phase = node.gstate;
    nodes[id] = {
      ...node,
      declared: node.declared ?? true,
      orphaned: node.orphaned ?? false,
      blockedReason: node.blockedReason ?? null,
      staleReason: node.staleReason ?? null,
      status,
      gen,
      cmd: node.cmd ?? "none",
      effect: node.effect ?? "idle",
      effectFence: node.effectFence ?? gen,
      completedGen: node.completedGen ?? (completed ? gen : 0),
      // `absent` on a node that had been dispatched is pre-worktree bookkeeping.
      gstate:
        phase !== undefined && phase !== "absent"
          ? phase
          : integrated
            ? "integrated"
            : completed
              ? "completed"
              : dispatched
                ? "created"
                : "absent",
      committed: node.committed ?? (completed || integrated),
      integrated,
      registered: node.registered ?? (completed || status === "in_progress"),
      merging: false,
      checked: node.checked ?? completed,
      worktree: node.worktree ?? null,
      branch: node.branch ?? null,
      base: node.base ?? null,
      completedCommit: node.completedCommit ?? null,
      mergeCommit: node.mergeCommit ?? null,
    };
  }
  // The dependency-integration coupling postdates the first snapshots: a node
  // that left `pending` was dispatched when dependency *completion* sufficed.
  for (const id of state.order) {
    const node = nodes[id];
    if (node === undefined || node.status === "pending") continue;
    for (const dep of node.deps) {
      const depNode = nodes[dep];
      if (depNode !== undefined && depNode.status === "completed" && !depNode.integrated) {
        nodes[dep] = { ...depNode, integrated: true, gstate: "integrated", committed: true };
      }
    }
  }
  return {
    ...state,
    nodes,
    droppedEffects: state.droppedEffects ?? 0,
    receipts: state.receipts ?? [],
  };
}

/** The declared node ids in declaration order. */
export function nodeIds(state: DagState): readonly NodeId[] {
  return state.order;
}

/** How a declaration relates to the current graph. */
export type DeclarationMode = "write" | "add";

/** Options for planning a declaration. */
export interface DeclarationOptions {
  /** `write` declares the whole graph and orphans absent nodes; `add` upserts. */
  readonly mode?: DeclarationMode;
  /** Physically delete absent nodes (write only) instead of orphaning them. */
  readonly prune?: boolean;
}

/** The change a declaration would make. */
export interface DeclarationDiff {
  readonly added: readonly NodeId[];
  readonly adopted: readonly NodeId[];
  readonly updated: readonly NodeId[];
  readonly unchanged: readonly NodeId[];
  readonly orphaned: readonly NodeId[];
  readonly removed: readonly NodeId[];
  readonly edges_added: readonly string[];
  readonly edges_removed: readonly string[];
  readonly stale: readonly NodeId[];
}

/** A model event produced by a declaration, in the order it must be applied. */
export type DeclarationEvent =
  | { readonly kind: "declare"; readonly node: NodeId; readonly files: readonly string[] }
  | { readonly kind: "adopt"; readonly node: NodeId; readonly files: readonly string[] }
  | { readonly kind: "amend"; readonly node: NodeId; readonly files: readonly string[] }
  | { readonly kind: "mark-stale"; readonly node: NodeId }
  | { readonly kind: "orphan"; readonly node: NodeId };

/** A validated declaration: errors (refused), warnings, diff, and the staged state. */
export interface DeclarationValidation {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly diff: DeclarationDiff;
  readonly state: DagState;
  readonly events: readonly DeclarationEvent[];
}

const CONFLICT_POLICIES: readonly ConflictPolicy[] = ["delegate", "ours", "theirs", "halt"];
const RUNNING_STATUSES: readonly SystemStatus[] = ["starting", "in_progress"];
const STALEABLE_STATUSES: readonly SystemStatus[] = ["completed", "blocked", "interrupted", "failed", "underspecified"];

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function sameDeps(left: readonly string[], right: readonly string[]): boolean {
  return sameSet(left, right);
}

interface EffectiveDefinition {
  readonly files: readonly string[];
  readonly kind: NodeKind;
  readonly policy: ConflictPolicy;
  readonly noop: boolean;
}

function effectiveDefinition(state: DagState, spec: NodeDeclaration): EffectiveDefinition {
  const existing = state.nodes[spec.id];
  const kind = spec.kind ?? existing?.kind ?? "task";
  return {
    files: spec.files !== undefined ? [...spec.files] : [...(existing?.files ?? [])],
    kind,
    policy: spec.policy ?? existing?.policy ?? (kind === "integration" ? "delegate" : "halt"),
    noop: spec.noop ?? existing?.noop ?? false,
  };
}

function definitionChanged(existing: DagNode, spec: NodeDeclaration, def: EffectiveDefinition): boolean {
  return (
    existing.content !== spec.content ||
    existing.brief !== spec.brief ||
    existing.kind !== def.kind ||
    existing.policy !== def.policy ||
    existing.noop !== def.noop ||
    !sameDeps(existing.deps, spec.deps) ||
    !sameSet(existing.files, def.files)
  );
}

/** Order a set of nodes so every node follows its dependencies. */
export function topologicalOrder(
  nodes: readonly { readonly id: NodeId; readonly deps: readonly NodeId[] }[],
): NodeId[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const done = new Set<NodeId>();
  const out: NodeId[] = [];
  const visit = (id: NodeId): void => {
    if (done.has(id)) return;
    done.add(id);
    for (const dep of byId.get(id)?.deps ?? []) if (byId.has(dep)) visit(dep);
    out.push(id);
  };
  for (const node of nodes) visit(node.id);
  return out;
}

/** The initial machine slice of a freshly added node. */
export function freshNode(
  spec: NodeDeclaration,
  def: EffectiveDefinition,
  blockedReason: string | null = null,
  staleReason: string | null = null,
): DagNode {
  return {
    id: spec.id,
    content: spec.content,
    brief: spec.brief,
    deps: [...spec.deps],
    kind: def.kind,
    files: [...def.files],
    policy: def.policy,
    noop: def.noop,
    declared: false,
    orphaned: false,
    blockedReason,
    staleReason,
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

function emptyDiff(): DeclarationDiff & { added: NodeId[]; adopted: NodeId[]; updated: NodeId[]; unchanged: NodeId[]; orphaned: NodeId[]; removed: NodeId[]; edges_added: string[]; edges_removed: string[]; stale: NodeId[] } {
  return {
    added: [],
    adopted: [],
    updated: [],
    unchanged: [],
    orphaned: [],
    removed: [],
    edges_added: [],
    edges_removed: [],
    stale: [],
  };
}

/** Set difference of two file/dep lists, ordered by the first list. */
function difference(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

/**
 * Validate a declaration and stage its effect without mutating the input.
 *
 * Merge-by-id: a node present in the state but absent from a `write` becomes
 * `orphaned` (retained), unless `prune` deletes it. A node already `orphaned`
 * and present again is `adopted`. A definition change to a node that has left
 * pending marks it `stale`; an `integrated` node's definition cannot change.
 */
export function validateDeclaration(
  state: DagState,
  declaration: readonly NodeDeclaration[],
  options: DeclarationOptions = {},
): DeclarationValidation {
  const mode: DeclarationMode = options.mode ?? "write";
  const prune = options.prune === true;
  const errors: string[] = [];
  const warnings: string[] = [];
  const diff = emptyDiff();
  const incoming = new Map(declaration.map((node) => [node.id, node]));
  const incomingIds = new Set(incoming.keys());

  if (incomingIds.size !== declaration.length) errors.push("duplicate node id");

  for (const node of declaration) {
    if (node.id.length === 0) errors.push("empty node id");
    if (node.content.trim().length === 0) errors.push(`${node.id}: empty content`);
    if (!node.brief.includes("VALIDATION:")) errors.push(`${node.id}: brief missing VALIDATION:`);
    if (!node.brief.includes("ACCEPTANCE:")) errors.push(`${node.id}: brief missing ACCEPTANCE:`);
    if (node.policy !== undefined && !CONFLICT_POLICIES.includes(node.policy)) {
      errors.push(`${node.id}: unknown conflict policy ${node.policy}`);
    }
  }

  // Every referenced dependency must exist now or in the declaration.
  const known = new Set<NodeId>([...Object.keys(state.nodes), ...incomingIds]);
  for (const node of declaration) {
    for (const dep of node.deps) {
      if (dep === node.id) errors.push(`${node.id}: self dependency`);
      else if (!known.has(dep)) errors.push(`${node.id}: unknown dependency ${dep}`);
    }
  }

  // Cycle detection over the union of existing and incoming definitions.
  const depsById = new Map<NodeId, readonly NodeId[]>();
  for (const id of Object.keys(state.nodes)) depsById.set(id, state.nodes[id]!.deps);
  for (const [id, node] of incoming) depsById.set(id, node.deps);
  const temporary = new Set<NodeId>();
  const permanent = new Set<NodeId>();
  const visit = (id: NodeId): void => {
    if (permanent.has(id)) return;
    if (temporary.has(id)) {
      errors.push(`cycle through ${id}`);
      return;
    }
    temporary.add(id);
    for (const dep of depsById.get(id) ?? []) if (known.has(dep)) visit(dep);
    temporary.delete(id);
    permanent.add(id);
  };
  for (const id of known) visit(id);

  // Which existing nodes are absent from the declaration.
  const absent = state.order.filter((id) => state.nodes[id] !== undefined && !incomingIds.has(id));
  const orphanedAbsent = absent.filter((id) => state.nodes[id]!.orphaned !== true);
  const removed = mode === "write" && prune ? orphanedAbsent : [];
  const orphaned = mode === "write" && !prune ? orphanedAbsent : [];
  diff.orphaned = orphaned;
  diff.removed = removed;

  // Effective active files (absent non-orphaned nodes are dropped/orphaned).
  const activeIds = [
    ...(mode === "add" ? state.order.filter((id) => !incomingIds.has(id) && state.nodes[id]!.orphaned !== true) : []),
    ...incomingIds,
  ];
  const effectiveFiles = new Map<NodeId, readonly string[]>();
  for (const id of activeIds) {
    const spec = incoming.get(id);
    effectiveFiles.set(id, spec !== undefined ? effectiveDefinition(state, spec).files : state.nodes[id]!.files);
  }
  const fileOwners = new Map<string, NodeId[]>();
  for (const [id, files] of effectiveFiles) {
    for (const file of files) fileOwners.set(file, [...(fileOwners.get(file) ?? []), id]);
  }
  for (const [file, owners] of fileOwners) {
    if (owners.length > 1) errors.push(`declared-files-overlap: ${file} is claimed by ${owners.join(", ")}`);
  }

  // Definition-change safety and the diff.
  for (const spec of declaration) {
    const existing = state.nodes[spec.id];
    const def = effectiveDefinition(state, spec);
    if (existing === undefined) {
      diff.added.push(spec.id);
      continue;
    }
    if (existing.orphaned && existing.declared) {
      diff.adopted.push(spec.id);
    } else if (definitionChanged(existing, spec, def)) {
      diff.updated.push(spec.id);
    } else {
      diff.unchanged.push(spec.id);
      continue;
    }

    for (const dep of difference(spec.deps, existing.deps)) diff.edges_added.push(`${spec.id} -> ${dep}`);
    for (const dep of difference(existing.deps, spec.deps)) diff.edges_removed.push(`${spec.id} -> ${dep}`);

    const filesChanged = !sameSet(existing.files, def.files);
    const depsChanged = !sameDeps(existing.deps, spec.deps);
    if (existing.integrated && (filesChanged || depsChanged || definitionChanged(existing, spec, def))) {
      errors.push(`${spec.id}: cannot change an integrated node; declare a new node instead`);
      continue;
    }
    if (existing.status !== "pending" && existing.status !== "parked" && depsChanged) {
      errors.push(`${spec.id}: cannot change the dependencies of a non-pending node`);
    }
    if (RUNNING_STATUSES.includes(existing.status)) {
      errors.push(`${spec.id}: cannot change a running node; stop it first`);
    }
    if (STALEABLE_STATUSES.includes(existing.status) && definitionChanged(existing, spec, def)) diff.stale.push(spec.id);
  }

  // An absent running node cannot be orphaned or pruned.
  for (const id of [...orphaned, ...removed]) {
    const node = state.nodes[id]!;
    if (RUNNING_STATUSES.includes(node.status) || node.effect === "running" || node.merging) {
      errors.push(`${id}: cannot ${removed.includes(id) ? "remove" : "orphan"} a running node; stop it first`);
    }
  }

  // Pruning must not break a remaining dependency.
  for (const id of removed) {
    for (const other of state.order) {
      if (removed.includes(other) || other === id) continue;
      if (state.nodes[other]!.deps.includes(id)) errors.push(`${id}: still required by ${other}`);
    }
  }

  // Warnings: a brief that announces an external condition but is dispatchable.
  const present = new Set<NodeId>([...incomingIds, ...activeIds]);
  for (const id of present) {
    const spec = incoming.get(id);
    const node = state.nodes[id];
    const brief = spec?.brief ?? node?.brief ?? "";
    const status = node?.status ?? "pending";
    if (/(EXTERNAL:|BLOCKED:)/.test(brief) && status !== "parked" && (spec?.deps ?? node?.deps ?? []).length === 0) {
      warnings.push(`${id}: brief declares EXTERNAL:/BLOCKED: but the node is ready; consider action=block`);
    }
  }

  // Stage: definitions patched and new nodes added. The store applies the
  // events below through the verified relation and commits once.
  try {
    const staged = buildStage(state, declaration, orphaned, removed, diff);
    return { errors, warnings, diff, state: staged.state, events: staged.events };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { errors, warnings, diff, state, events: [] };
  }
}

interface Staged {
  readonly state: DagState;
  readonly events: readonly DeclarationEvent[];
}

/**
 * Build the staged state and the ordered model events.
 *
 * File ownership is reported to the model one transition at a time, so a
 * transfer (node A releases f for node B) must be sequenced: an event that
 * releases a file precedes any event that acquires it. The events are ordered
 * by that transfer graph; a cycle is impossible because the validator already
 * refused a final assignment that could not be sequenced.
 */
function buildStage(
  state: DagState,
  declaration: readonly NodeDeclaration[],
  orphaned: readonly NodeId[],
  removed: readonly NodeId[],
  diff: DeclarationDiff,
): Staged {
  const nodes: Record<NodeId, DagNode> = { ...state.nodes };

  // Orphans and prunes free their files.
  for (const id of orphaned) {
    const node = nodes[id]!;
    nodes[id] = { ...node, declared: true, orphaned: true, files: [], staleReason: null };
  }
  for (const id of removed) delete nodes[id];

  const releasing = new Map<NodeId, readonly string[]>();
  const acquiring = new Map<NodeId, readonly string[]>();
  const events: DeclarationEvent[] = [];

  for (const spec of declaration) {
    const existing = nodes[spec.id];
    const def = effectiveDefinition(state, spec);
    if (existing === undefined) {
      nodes[spec.id] = freshNode(spec, def);
      acquiring.set(spec.id, def.files);
      events.push({ kind: "declare", node: spec.id, files: def.files });
      continue;
    }
    if (existing.orphaned) {
      nodes[spec.id] = {
        ...existing,
        content: spec.content,
        brief: spec.brief,
        deps: [...spec.deps],
        kind: def.kind,
        files: def.files,
        policy: def.policy,
        noop: def.noop,
      };
      acquiring.set(spec.id, def.files);
      events.push({ kind: "adopt", node: spec.id, files: def.files });
      if (diff.stale.includes(spec.id)) events.push({ kind: "mark-stale", node: spec.id });
      continue;
    }
    const filesChanged = !sameSet(existing.files, def.files);
    const changed = definitionChanged(existing, spec, def);
    nodes[spec.id] = {
      ...existing,
      content: spec.content,
      brief: spec.brief,
      deps: [...spec.deps],
      kind: def.kind,
      files: filesChanged ? def.files : existing.files,
      policy: def.policy,
      noop: def.noop,
      staleReason: diff.stale.includes(spec.id) ? "definition changed" : existing.staleReason,
    };
    if (filesChanged) {
      releasing.set(spec.id, existing.files);
      acquiring.set(spec.id, def.files);
      events.push({ kind: "amend", node: spec.id, files: def.files });
    } else if (changed && !diff.stale.includes(spec.id)) {
      // pending/parked nodes are amended in place; no model event needed.
      void changed;
    } else if (changed) {
      events.push({ kind: "mark-stale", node: spec.id });
    }
  }

  // Topologically order events by file transfers (releaser before acquirer).
  const order = orderEvents(events, releasing, acquiring);
  const orderedNodes: Record<NodeId, DagNode> = {};
  for (const id of topologicalOrder(Object.values(nodes).map((node) => ({ id: node.id, deps: nodes[node.id]!.deps })))) {
    if (nodes[id] !== undefined) orderedNodes[id] = nodes[id]!;
  }
  return { state: { ...state, nodes: orderedNodes, order: Object.keys(orderedNodes) }, events: order };
}

function orderEvents(
  events: readonly DeclarationEvent[],
  releasing: ReadonlyMap<NodeId, readonly string[]>,
  acquiring: ReadonlyMap<NodeId, readonly string[]>,
): DeclarationEvent[] {
  const index = new Map(events.map((event, position) => [`${event.kind}:${event.node}`, position]));
  const edges = new Map<number, Set<number>>();
  const indegree = new Map<number, number>();
  for (let i = 0; i < events.length; i += 1) {
    edges.set(i, new Set());
    indegree.set(i, 0);
  }
  const addEdge = (from: number, to: number): void => {
    if (from === to || edges.get(from)!.has(to)) return;
    edges.get(from)!.add(to);
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
  };
  // A node's own events keep their insertion order (e.g. adopt then stale).
  const previous = new Map<NodeId, number>();
  for (let i = 0; i < events.length; i += 1) {
    const node = events[i]!.node;
    const before = previous.get(node);
    if (before !== undefined) addEdge(before, i);
    previous.set(node, i);
  }
  for (const [releaser, files] of releasing) {
    for (const [acquirer, wanted] of acquiring) {
      if (releaser === acquirer) continue;
      if (!files.some((file) => wanted.includes(file))) continue;
      const from = index.get(`amend:${releaser}`) ?? index.get(`declare:${releaser}`) ?? index.get(`adopt:${releaser}`);
      const to = index.get(`amend:${acquirer}`) ?? index.get(`declare:${acquirer}`) ?? index.get(`adopt:${acquirer}`);
      if (from !== undefined && to !== undefined) addEdge(from, to);
    }
  }
  // Kahn's algorithm, seeded in insertion order, for a stable topological sort.
  const queue = events.map((_, i) => i).filter((i) => (indegree.get(i) ?? 0) === 0);
  const out: DeclarationEvent[] = [];
  while (queue.length > 0) {
    const i = queue.shift()!;
    out.push(events[i]!);
    for (const next of edges.get(i) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 1) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  if (out.length !== events.length) {
    throw new Error("cannot sequence declared file ownership changes; declare the nodes in separate steps");
  }
  return out;
}
