/**
 * Board projection.
 *
 * The ready set is not a presentation detail: it is the set of nodes the
 * composed model will accept a `dispatch` for, computed by asking the verified
 * guard rather than re-deriving "dependencies are integrated" locally.
 *
 * `status` and `plan` explain readiness: why a node is or is not dispatchable,
 * and the topologically ordered future waves.
 */

import type { SystemStatus } from "../formal/system-model.ts";
import { isEnabled } from "./reducer.ts";
import type { DagState, NodeId } from "./state.ts";

/** A safe, model-facing board projection. */
export interface BoardNode {
  readonly id: NodeId;
  readonly deps: readonly NodeId[];
  readonly status: SystemStatus;
  readonly gen: number;
  readonly orphaned: boolean;
  readonly ready: boolean;
  readonly blockedReason: string | null;
  readonly staleReason: string | null;
  /** For a not-yet-ready node, which dependency holds it and why. */
  readonly waitingOn: readonly { readonly dep: NodeId; readonly reason: string }[];
}

/** The board. `ready` is exactly the set the dispatch guard accepts. */
export interface DagBoard {
  readonly revision: number;
  readonly counts: Readonly<Record<SystemStatus, number>>;
  readonly ready: readonly NodeId[];
  readonly nodes: readonly BoardNode[];
}

/** The topologically ordered future waves, including parked/blocked nodes. */
export interface DagPlan {
  readonly waves: readonly { readonly index: number; readonly nodes: readonly NodeId[] }[];
}

function emptyCounts(): Record<SystemStatus, number> {
  return {
    pending: 0,
    starting: 0,
    in_progress: 0,
    completed: 0,
    blocked: 0,
    failed: 0,
    interrupted: 0,
    underspecified: 0,
    parked: 0,
    stale: 0,
  };
}

function describe(state: DagState, id: NodeId): string {
  const node = state.nodes[id];
  if (node === undefined) return "unknown";
  if (node.orphaned) return "orphaned";
  if (node.status === "parked") return node.blockedReason === null ? "blocked" : `blocked: ${node.blockedReason}`;
  if (node.status === "stale") return node.staleReason === null ? "stale" : `stale: ${node.staleReason}`;
  return node.status;
}

function waitingOn(state: DagState, id: NodeId): { dep: NodeId; reason: string }[] {
  const node = state.nodes[id];
  if (node === undefined) return [];
  const waiting: { dep: NodeId; reason: string }[] = [];
  for (const dep of node.deps) {
    const depNode = state.nodes[dep];
    if (depNode?.integrated === true) continue;
    waiting.push({ dep, reason: describe(state, dep) });
  }
  return waiting;
}

/** Derive the board. `ready` is exactly the set the dispatch guard accepts. */
export function projectBoard(state: DagState): DagBoard {
  const counts = emptyCounts();
  const nodes = state.order.map((id) => {
    const node = state.nodes[id]!;
    counts[node.status] += 1;
    return {
      id,
      deps: node.deps,
      status: node.status,
      gen: node.gen,
      orphaned: node.orphaned,
      ready: isEnabled(state, { type: "dispatch", node: id }),
      blockedReason: node.blockedReason,
      staleReason: node.staleReason,
      waitingOn: waitingOn(state, id),
    };
  });
  const ready = state.order.filter((id) => isEnabled(state, { type: "dispatch", node: id }));
  return { revision: state.revision, counts, ready, nodes };
}

/**
 * The topologically ordered future waves: every active node's wave is one past
 * the deepest dependency. Parked and blocked nodes are included, so the whole
 * declared shape is visible before anything runs.
 */
export function projectPlan(state: DagState): DagPlan {
  const active = state.order.filter((id) => state.nodes[id] !== undefined && !state.nodes[id]!.orphaned);
  const activeSet = new Set(active);
  const depth = new Map<NodeId, number>();
  const visiting = new Set<NodeId>();
  const compute = (id: NodeId): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // a cycle is a declaration error; do not loop
    visiting.add(id);
    let value = 1;
    for (const dep of state.nodes[id]!.deps) {
      if (activeSet.has(dep)) value = Math.max(value, compute(dep) + 1);
    }
    visiting.delete(id);
    depth.set(id, value);
    return value;
  };
  for (const id of active) compute(id);
  const max = active.reduce((best, id) => Math.max(best, depth.get(id) ?? 1), 0);
  const waves: { index: number; nodes: NodeId[] }[] = [];
  for (let index = 1; index <= max; index += 1) {
    const nodes = active.filter((id) => (depth.get(id) ?? 1) === index);
    if (nodes.length > 0) waves.push({ index, nodes });
  }
  return { waves };
}
