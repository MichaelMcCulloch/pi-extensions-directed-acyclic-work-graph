/**
 * Board projection.
 *
 * The ready set is not a presentation detail: it is the set of nodes the
 * composed model will accept a `dispatch` for, computed by asking the verified
 * guard rather than re-deriving "dependencies are integrated" locally.
 */

import type { SystemStatus } from "../formal/system-model.ts";
import { isEnabled } from "./reducer.ts";
import type { DagState, NodeId } from "./state.ts";

/** A safe, model-facing board projection. */
export interface DagBoard {
  readonly revision: number;
  readonly counts: Readonly<Record<SystemStatus, number>>;
  readonly ready: readonly NodeId[];
  readonly nodes: readonly {
    readonly id: NodeId;
    readonly deps: readonly NodeId[];
    readonly status: SystemStatus;
    readonly gen: number;
  }[];
}

/** Derive the board. `ready` is exactly the set the dispatch guard accepts. */
export function projectBoard(state: DagState): DagBoard {
  const counts: Record<SystemStatus, number> = {
    pending: 0,
    starting: 0,
    in_progress: 0,
    completed: 0,
    blocked: 0,
    failed: 0,
    interrupted: 0,
    underspecified: 0,
  };
  const nodes = state.order.map((id) => {
    const node = state.nodes[id]!;
    counts[node.status] += 1;
    return { id, deps: node.deps, status: node.status, gen: node.gen };
  });
  const ready = state.order.filter((id) => isEnabled(state, { type: "dispatch", node: id }));
  return { revision: state.revision, counts, ready, nodes };
}
