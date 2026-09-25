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
  | { readonly type: "dispatch"; readonly node: NodeId; readonly base: string; readonly worktree: string; readonly branch: string }
  | { readonly type: "finish-worktree"; readonly node: NodeId }
  | { readonly type: "admit"; readonly node: NodeId }
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
    declared: pick(() => true),
    files: pick((id) => [...state.nodes[id]!.files]),
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
  };
}

/** Map a command to the abstract event it applies. */
export function eventsForCommand(command: DagCommand): SystemEvent[] {
  switch (command.type) {
    case "dispatch":
      return [{ type: "dispatch", node: command.node }];
    case "finish-worktree":
      return [{ type: "finish-worktree", node: command.node }];
    case "admit":
      return [{ type: "admit", node: command.node }];
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
    case "finish-worktree":
    case "admit":
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
    case "dispatch":
      return systemGuards.dispatch(config, abs, event.node);
    case "finish-worktree":
      return systemGuards["finish-worktree"](abs, event.node);
    case "admit":
      return systemGuards.admit(abs, event.node);
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
  const after = referenceReduceSystemState(abstractSystemState(state), event, configOf(state));
  const node = "node" in event ? event.node : null;
  const nodes: Record<NodeId, DagNode> = {};
  for (const id of state.order) {
    const nodeState = state.nodes[id]!;
    nodes[id] = {
      ...nodeState,
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
