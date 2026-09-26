/**
 * The production reducer.
 *
 * The machine transition is `referenceReduceSystemState` — the executable mirror
 * of `spec/DagSystem.tla` — applied to the production state. Production does not
 * re-implement the transition relation, so the interaction between the
 * scheduler and the worktree domains is the verified relation itself, not a
 * runtime assertion over two copies.
 */

import {
  DagSystemError,
  referenceReduceSystemState,
  systemGuards,
  type AbstractSystemState,
  type SystemEvent,
  type SystemModelConfig,
} from "../formal/system-model.ts";
import type { DagNode, DagReceipt, DagState, NodeId } from "./state.ts";

/** A command the dispatcher or the store can issue. */
export type DagCommand =
  | { readonly type: "declare"; readonly node: NodeId; readonly files: readonly string[] }
  | { readonly type: "adopt"; readonly node: NodeId; readonly files: readonly string[] }
  | { readonly type: "orphan"; readonly node: NodeId }
  | { readonly type: "amend"; readonly node: NodeId; readonly files: readonly string[] }
  | { readonly type: "mark-stale"; readonly node: NodeId }
  | { readonly type: "reset"; readonly node: NodeId }
  | { readonly type: "park"; readonly node: NodeId }
  | { readonly type: "unpark"; readonly node: NodeId }
  | { readonly type: "dispatch"; readonly node: NodeId; readonly base: string; readonly worktree: string; readonly branch: string }
  | { readonly type: "finish-worktree"; readonly node: NodeId }
  | { readonly type: "admit"; readonly node: NodeId }
  | { readonly type: "check-files"; readonly node: NodeId }
  | { readonly type: "complete"; readonly node: NodeId; readonly completedCommit: string }
  | { readonly type: "block"; readonly node: NodeId; readonly reason: string }
  | { readonly type: "underspecify"; readonly node: NodeId; readonly question: string }
  | { readonly type: "fail"; readonly node: NodeId; readonly error: string }
  | { readonly type: "effect-stale"; readonly node: NodeId }
  | { readonly type: "resume"; readonly node: NodeId; readonly message: string }
  | { readonly type: "steer"; readonly node: NodeId; readonly message: string }
  | { readonly type: "stop"; readonly node: NodeId; readonly reason?: string }
  | { readonly type: "begin-merge"; readonly node: NodeId }
  | { readonly type: "commit-merge"; readonly node: NodeId; readonly mergeCommit: string }
  | { readonly type: "merge-conflict"; readonly node: NodeId }
  | { readonly type: "resolve-conflict"; readonly node: NodeId; readonly mergeCommit: string }
  | { readonly type: "remove"; readonly node: NodeId }
  | { readonly type: "reconcile"; readonly node: NodeId }
  | { readonly type: "crash" }
  | { readonly type: "reopen" };

/** An external effect the runtime must run after the append. */
export type DagEffect =
  | { readonly kind: "run-node"; readonly node: NodeId; readonly message: string | null }
  | { readonly kind: "cancel-node"; readonly node: NodeId }
  | { readonly kind: "reconcile-node"; readonly node: NodeId };

/** The result of one accepted command. */
export interface ReduceResult {
  readonly state: DagState;
  readonly events: readonly SystemEvent[];
  readonly effects: readonly DagEffect[];
}

/** The composed model config for a live declaration. */
export function configOf(state: DagState): SystemModelConfig {
  const nodes = [...state.order];
  const deps: Record<string, readonly string[]> = {};
  for (const id of nodes) deps[id] = state.nodes[id]!.deps;
  return {
    nodes,
    deps,
    fileUniverse: [...new Set(nodes.flatMap((id) => [...state.nodes[id]!.files]))],
    maxGen: Number.MAX_SAFE_INTEGER,
    maxDropped: Number.MAX_SAFE_INTEGER,
  };
}

/** Project durable state onto the composed abstract vocabulary. */
export function abstractSystemState(state: DagState): AbstractSystemState {
  const pick = <T>(value: (id: string) => T): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const id of state.order) out[id] = value(id);
    return out;
  };
  return {
    declared: pick((id) => state.nodes[id]!.declared),
    files: pick((id) => [...state.nodes[id]!.files]),
    orphaned: pick((id) => state.nodes[id]!.orphaned),
    status: pick((id) => state.nodes[id]!.status),
    gen: pick((id) => state.nodes[id]!.gen),
    cmd: pick((id) => state.nodes[id]!.cmd),
    effect: pick((id) => state.nodes[id]!.effect),
    effectFence: pick((id) => state.nodes[id]!.effectFence),
    completedGen: pick((id) => state.nodes[id]!.completedGen),
    dropped: state.droppedEffects,
    gstate: pick((id) => state.nodes[id]!.gstate),
    committed: pick((id) => state.nodes[id]!.committed),
    integrated: pick((id) => state.nodes[id]!.integrated),
    registered: pick((id) => state.nodes[id]!.registered),
    merging: pick((id) => state.nodes[id]!.merging),
    checked: pick((id) => state.nodes[id]!.checked),
  };
}

/** Map a command to the abstract event it applies. */
export function eventsForCommand(command: DagCommand): SystemEvent[] {
  switch (command.type) {
    case "declare":
      return [{ type: "declare", node: command.node, files: command.files }];
    case "adopt":
      return [{ type: "adopt", node: command.node, files: command.files }];
    case "orphan":
      return [{ type: "orphan", node: command.node }];
    case "amend":
      return [{ type: "amend", node: command.node, files: command.files }];
    case "mark-stale":
      return [{ type: "mark-stale", node: command.node }];
    case "reset":
      return [{ type: "reset", node: command.node }];
    case "park":
      return [{ type: "park", node: command.node }];
    case "unpark":
      return [{ type: "unpark", node: command.node }];
    case "dispatch":
      return [{ type: "dispatch", node: command.node }];
    case "finish-worktree":
      return [{ type: "finish-worktree", node: command.node }];
    case "admit":
      return [{ type: "admit", node: command.node }];
    case "check-files":
      return [{ type: "check-files", node: command.node }];
    case "complete":
      return [{ type: "complete", node: command.node }];
    case "block":
      return [{ type: "block", node: command.node }];
    case "underspecify":
      return [{ type: "underspecify", node: command.node }];
    case "fail":
      return [{ type: "fail", node: command.node }];
    case "effect-stale":
      return [{ type: "effect-stale", node: command.node }];
    case "resume":
      return [{ type: "resume", node: command.node }];
    case "steer":
      return [{ type: "steer", node: command.node }];
    case "stop":
      return [{ type: "stop", node: command.node }];
    case "begin-merge":
      return [{ type: "begin-merge", node: command.node }];
    case "commit-merge":
      return [{ type: "commit-merge", node: command.node }];
    case "merge-conflict":
      return [{ type: "merge-conflict", node: command.node }];
    case "resolve-conflict":
      return [{ type: "resolve-conflict", node: command.node }];
    case "remove":
      return [{ type: "remove", node: command.node }];
    case "reconcile":
      return [{ type: "reconcile", node: command.node }];
    case "crash":
      return [{ type: "crash" }];
    case "reopen":
      return [{ type: "reopen" }];
  }
}

/** Map a command to the effects the runtime must run after the append. */
export function effectsForCommand(command: DagCommand): DagEffect[] {
  switch (command.type) {
    case "dispatch":
      return [{ kind: "run-node", node: command.node, message: null }];
    case "steer":
      return [
        { kind: "cancel-node", node: command.node },
        { kind: "run-node", node: command.node, message: command.message },
      ];
    case "stop":
      return [{ kind: "cancel-node", node: command.node }];
    case "reconcile":
      return [{ kind: "reconcile-node", node: command.node }];
    case "declare":
    case "adopt":
    case "orphan":
    case "amend":
    case "mark-stale":
    case "reset":
    case "park":
    case "unpark":
    case "finish-worktree":
    case "admit":
    case "check-files":
    case "complete":
    case "block":
    case "underspecify":
    case "fail":
    case "effect-stale":
    case "resume":
    case "begin-merge":
    case "commit-merge":
    case "merge-conflict":
    case "resolve-conflict":
    case "remove":
    case "crash":
    case "reopen":
      return [];
  }
}

/** Ask the verified guards whether an event is enabled in a live state. */
export function isEnabled(state: DagState, event: SystemEvent): boolean {
  const config = configOf(state);
  const abs = abstractSystemState(state);
  switch (event.type) {
    case "declare":
      return systemGuards.declare(config, abs, event.node, event.files);
    case "adopt":
      return systemGuards.adopt(config, abs, event.node, event.files);
    case "orphan":
      return systemGuards.orphan(abs, event.node);
    case "amend":
      return systemGuards.amend(config, abs, event.node, event.files);
    case "mark-stale":
      return systemGuards["mark-stale"](abs, event.node);
    case "reset":
      return systemGuards.reset(abs, event.node);
    case "park":
      return systemGuards.park(abs, event.node);
    case "unpark":
      return systemGuards.unpark(abs, event.node);
    case "dispatch":
      return systemGuards.dispatch(config, abs, event.node);
    case "finish-worktree":
      return systemGuards["finish-worktree"](abs, event.node);
    case "admit":
      return systemGuards.admit(abs, event.node);
    case "check-files":
      return systemGuards["check-files"](abs, event.node);
    case "complete":
    case "block":
    case "underspecify":
    case "fail":
      return systemGuards.settle(abs, event.node);
    case "effect-stale":
      return systemGuards["effect-stale"](config, abs, event.node);
    case "resume":
      return systemGuards.resume(config, abs, event.node);
    case "steer":
      return systemGuards.steer(config, abs, event.node);
    case "stop":
      return systemGuards.stop(config, abs, event.node);
    case "begin-merge":
      return systemGuards["begin-merge"](abs, event.node);
    case "commit-merge":
      return systemGuards["commit-merge"](abs, event.node);
    case "merge-conflict":
      return systemGuards["merge-conflict"](abs, event.node);
    case "resolve-conflict":
      return systemGuards["resolve-conflict"](abs, event.node);
    case "remove":
      return systemGuards.remove(abs, event.node);
    case "reconcile":
      return systemGuards.reconcile(config, abs, event.node);
    case "crash":
    case "reopen":
      return true;
  }
}

/** Apply one composed event, recording it as a durable receipt. */
export function applyEvent(state: DagState, event: SystemEvent): DagState {
  const before = abstractSystemState(state);
  const after = referenceReduceSystemState(before, event, configOf(state));
  // A model stutter (crash with no merge in progress, reopen with no live
  // effect) leaves the machine unchanged; do not burn a revision on it.
  if (JSON.stringify(before) === JSON.stringify(after)) return state;
  const node = "node" in event ? event.node : null;
  const nodes: Record<NodeId, DagNode> = {};
  for (const id of state.order) {
    const nodeState = state.nodes[id]!;
    nodes[id] = {
      ...nodeState,
      declared: after.declared[id] === true,
      files: [...(after.files[id] ?? [])],
      orphaned: after.orphaned[id] === true,
      status: after.status[id]!,
      gen: after.gen[id]!,
      cmd: after.cmd[id]!,
      effect: after.effect[id]!,
      effectFence: after.effectFence[id]!,
      completedGen: after.completedGen[id]!,
      gstate: after.gstate[id]!,
      committed: after.committed[id] === true,
      integrated: after.integrated[id] === true,
      registered: after.registered[id] === true,
      merging: after.merging[id] === true,
      checked: after.checked[id] === true,
    };
  }
  const revision = state.revision + 1;
  const receipt: DagReceipt = {
    revision,
    operationId: `op-${state.operationCounter + 1}`,
    action: event.type,
    node,
  };
  return {
    ...state,
    nodes,
    droppedEffects: after.dropped,
    revision,
    operationCounter: state.operationCounter + 1,
    receipts: [...state.receipts, receipt],
  };
}

/** Record the git facts a command observed. */
function withFacts(state: DagState, command: DagCommand): DagState {
  if (command.type === "dispatch") {
    const node = state.nodes[command.node]!;
    return {
      ...state,
      nodes: {
        ...state.nodes,
        [command.node]: { ...node, worktree: command.worktree, branch: command.branch, base: command.base },
      },
    };
  }
  if (command.type === "complete") {
    const node = state.nodes[command.node]!;
    return { ...state, nodes: { ...state.nodes, [command.node]: { ...node, completedCommit: command.completedCommit } } };
  }
  if (command.type === "commit-merge" || command.type === "resolve-conflict") {
    const node = state.nodes[command.node]!;
    return { ...state, nodes: { ...state.nodes, [command.node]: { ...node, mergeCommit: command.mergeCommit } } };
  }
  if (command.type === "reset") {
    // The model returns the node to pending; the workspace facts are abandoned
    // with the worktree so a later dispatch starts clean.
    const node = state.nodes[command.node]!;
    return {
      ...state,
      nodes: {
        ...state.nodes,
        [command.node]: {
          ...node,
          worktree: null,
          branch: null,
          base: null,
          completedCommit: null,
          mergeCommit: null,
          staleReason: null,
        },
      },
    };
  }
  return state;
}

/** Apply a command: record facts, apply the event, then report the effects. */
export function reduceCommand(state: DagState, command: DagCommand): ReduceResult {
  const events = eventsForCommand(command);
  let next = withFacts(state, command);
  for (const event of events) next = applyEvent(next, event);
  return { state: next, events, effects: effectsForCommand(command) };
}

export { DagSystemError };
