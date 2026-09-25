/**
 * The single executable model of the DAG tool.
 *
 * This is the TypeScript mirror of `spec/DagSystem.tla` — the composed product
 * of the scheduler machine and the worktree/integration machine, plus declared
 * file ownership. It replaces the two half-models (`model.ts`, `git-model.ts`)
 * as the verification subject: one state, one transition relation, one set of
 * invariants, including the coupling invariants that neither half could state.
 *
 * `test/system-model.spec.ts` explores it exhaustively and asserts the reachable
 * set is exactly the size TLC reports, so the specification and this
 * transcription cannot drift.
 */

export type NodeId = string;

/** The scheduler lifecycle of a node. */
export type SystemStatus =
  | "pending"
  | "starting"
  | "in_progress"
  | "completed"
  | "blocked"
  | "failed"
  | "interrupted"
  | "underspecified";

/** Statuses in which a node is suspended with its worktree still intact. */
const SUSPENDED_STATUSES: ReadonlySet<SystemStatus> = new Set([
  "blocked",
  "interrupted",
  "failed",
  "underspecified",
]);

/** The worktree/integration phase of a node. */
export type GitPhase = "absent" | "created" | "completed" | "integrated" | "conflicted" | "removed";

/** The finite verification target: one edge, two files. */
export interface SystemModelConfig {
  readonly nodes: readonly NodeId[];
  readonly deps: Readonly<Record<NodeId, readonly NodeId[]>>;
  readonly fileUniverse: readonly string[];
  readonly maxGen: number;
  readonly maxDropped: number;
}

/** The bounds used by the TLC fixture `spec/DagSystemFixture.tla`. */
export const SYSTEM_MODEL: SystemModelConfig = {
  nodes: ["n1", "n2"],
  deps: { n1: [], n2: ["n1"] },
  fileUniverse: ["f1", "f2"],
  maxGen: 2,
  maxDropped: 4,
};

/** The complete composed state. */
export interface AbstractSystemState {
  readonly declared: Readonly<Record<NodeId, boolean>>;
  readonly files: Readonly<Record<NodeId, readonly string[]>>;
  readonly status: Readonly<Record<NodeId, SystemStatus>>;
  readonly gen: Readonly<Record<NodeId, number>>;
  readonly cmd: Readonly<Record<NodeId, "none" | "accepted">>;
  readonly effect: Readonly<Record<NodeId, "idle" | "running">>;
  readonly effectFence: Readonly<Record<NodeId, number>>;
  readonly completedGen: Readonly<Record<NodeId, number>>;
  readonly dropped: number;
  readonly gstate: Readonly<Record<NodeId, GitPhase>>;
  readonly committed: Readonly<Record<NodeId, boolean>>;
  readonly integrated: Readonly<Record<NodeId, boolean>>;
  readonly registered: Readonly<Record<NodeId, boolean>>;
  readonly merging: Readonly<Record<NodeId, boolean>>;
  /** The dispatcher validated that the completion commit touched only declared files. */
  readonly checked: Readonly<Record<NodeId, boolean>>;
}

/** The event alphabet. */
export type SystemEvent =
  | { readonly type: "declare"; readonly node: NodeId; readonly files: readonly string[] }
  | { readonly type: "dispatch"; readonly node: NodeId }
  | { readonly type: "finish-worktree"; readonly node: NodeId }
  | { readonly type: "admit"; readonly node: NodeId }
  | { readonly type: "check-files"; readonly node: NodeId }
  | { readonly type: "complete"; readonly node: NodeId }
  | { readonly type: "block"; readonly node: NodeId }
  | { readonly type: "underspecify"; readonly node: NodeId }
  | { readonly type: "fail"; readonly node: NodeId }
  | { readonly type: "effect-stale"; readonly node: NodeId }
  | { readonly type: "resume"; readonly node: NodeId }
  | { readonly type: "steer"; readonly node: NodeId }
  | { readonly type: "stop"; readonly node: NodeId }
  | { readonly type: "begin-merge"; readonly node: NodeId }
  | { readonly type: "commit-merge"; readonly node: NodeId }
  | { readonly type: "merge-conflict"; readonly node: NodeId }
  | { readonly type: "resolve-conflict"; readonly node: NodeId }
  | { readonly type: "remove"; readonly node: NodeId }
  | { readonly type: "reconcile"; readonly node: NodeId }
  | { readonly type: "crash" }
  | { readonly type: "reopen" };

export type SystemAction = SystemEvent["type"];

/** Every action of the composed machine, in specification order. */
export const SYSTEM_ACTIONS: readonly SystemAction[] = [
  "declare",
  "dispatch",
  "finish-worktree",
  "admit",
  "check-files",
  "complete",
  "block",
  "underspecify",
  "fail",
  "effect-stale",
  "resume",
  "steer",
  "stop",
  "begin-merge",
  "commit-merge",
  "merge-conflict",
  "resolve-conflict",
  "remove",
  "reconcile",
  "crash",
  "reopen",
];

/** Construct the initial composed state. */
export function initAbstractSystemState(config: SystemModelConfig = SYSTEM_MODEL): AbstractSystemState {
  const declared: Record<NodeId, boolean> = {};
  const files: Record<NodeId, string[]> = {};
  const status: Record<NodeId, SystemStatus> = {};
  const gen: Record<NodeId, number> = {};
  const cmd: Record<NodeId, "none" | "accepted"> = {};
  const effect: Record<NodeId, "idle" | "running"> = {};
  const effectFence: Record<NodeId, number> = {};
  const completedGen: Record<NodeId, number> = {};
  const gstate: Record<NodeId, GitPhase> = {};
  const committed: Record<NodeId, boolean> = {};
  const integrated: Record<NodeId, boolean> = {};
  const registered: Record<NodeId, boolean> = {};
  const merging: Record<NodeId, boolean> = {};
  const checked: Record<NodeId, boolean> = {};
  for (const node of config.nodes) {
    declared[node] = false;
    files[node] = [];
    status[node] = "pending";
    gen[node] = 0;
    cmd[node] = "none";
    effect[node] = "idle";
    effectFence[node] = 0;
    completedGen[node] = 0;
    gstate[node] = "absent";
    committed[node] = false;
    integrated[node] = false;
    registered[node] = false;
    merging[node] = false;
    checked[node] = false;
  }
  return {
    declared,
    files,
    status,
    gen,
    cmd,
    effect,
    effectFence,
    completedGen,
    dropped: 0,
    gstate,
    committed,
    integrated,
    registered,
    merging,
    checked,
  };
}

/** Why a system step was refused. */
export class DagSystemError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DagSystemError";
  }
}

function set<K extends string, V>(record: Readonly<Record<K, V>>, key: K, value: V): Record<K, V> {
  return { ...record, [key]: value };
}

function depsOf(config: SystemModelConfig, node: NodeId): readonly NodeId[] {
  return config.deps[node] ?? [];
}

function depsIntegrated(config: SystemModelConfig, state: AbstractSystemState, node: NodeId): boolean {
  return depsOf(config, node).every((dep) => state.integrated[dep] === true);
}

function depsCompleted(config: SystemModelConfig, state: AbstractSystemState, node: NodeId): boolean {
  return depsOf(config, node).every((dep) => state.status[dep] === "completed");
}

function disjoint(left: readonly string[], right: readonly string[]): boolean {
  return left.every((file) => !right.includes(file));
}

/** The guards, one per action. */
export const systemGuards = {
  declare: (config: SystemModelConfig, state: AbstractSystemState, node: NodeId, files: readonly string[]): boolean =>
    state.declared[node] !== true &&
    files.every((file) => config.fileUniverse.includes(file)) &&
    config.nodes.every((other) => state.declared[other] !== true || disjoint(state.files[other] ?? [], files)),

  dispatch: (config: SystemModelConfig, state: AbstractSystemState, node: NodeId): boolean =>
    state.declared[node] === true &&
    state.status[node] === "pending" &&
    state.cmd[node] === "none" &&
    state.effect[node] === "idle" &&
    state.gen[node]! < config.maxGen &&
    state.gstate[node] === "absent" &&
    depsIntegrated(config, state, node),

  "finish-worktree": (state: AbstractSystemState, node: NodeId): boolean =>
    state.gstate[node] === "created" && state.registered[node] !== true,

  "check-files": (state: AbstractSystemState, node: NodeId): boolean =>
    state.effect[node] === "running" &&
    state.effectFence[node] === state.gen[node] &&
    state.status[node] === "in_progress" &&
    state.checked[node] !== true,

  admit: (state: AbstractSystemState, node: NodeId): boolean =>
    state.cmd[node] === "accepted" &&
    state.effect[node] === "idle" &&
    state.gstate[node] === "created" &&
    state.registered[node] === true,

  settle: (state: AbstractSystemState, node: NodeId): boolean =>
    state.effect[node] === "running" &&
    state.effectFence[node] === state.gen[node] &&
    state.status[node] === "in_progress",

  "effect-stale": (config: SystemModelConfig, state: AbstractSystemState, node: NodeId): boolean =>
    state.effect[node] === "running" &&
    state.effectFence[node]! < state.gen[node]! &&
    state.dropped < config.maxDropped,

  resume: (config: SystemModelConfig, state: AbstractSystemState, node: NodeId): boolean =>
    (state.status[node] === "blocked" ||
      state.status[node] === "interrupted" ||
      state.status[node] === "failed" ||
      state.status[node] === "underspecified") &&
    state.cmd[node] === "none" &&
    state.effect[node] === "idle" &&
    state.gen[node]! < config.maxGen &&
    state.gstate[node] === "created",

  steer: (config: SystemModelConfig, state: AbstractSystemState, node: NodeId): boolean =>
    (state.status[node] === "in_progress" ||
      state.status[node] === "blocked" ||
      state.status[node] === "interrupted" ||
      state.status[node] === "failed" ||
      state.status[node] === "underspecified") &&
    state.gen[node]! < config.maxGen,

  stop: (config: SystemModelConfig, state: AbstractSystemState, node: NodeId): boolean =>
    (state.status[node] === "starting" || state.status[node] === "in_progress" || state.cmd[node] === "accepted") &&
    state.gen[node]! < config.maxGen,

  "begin-merge": (state: AbstractSystemState, node: NodeId): boolean =>
    state.status[node] === "completed" &&
    state.committed[node] === true &&
    state.integrated[node] !== true &&
    state.merging[node] !== true,

  "commit-merge": (state: AbstractSystemState, node: NodeId): boolean =>
    state.status[node] === "completed" && state.merging[node] === true,

  "merge-conflict": (state: AbstractSystemState, node: NodeId): boolean =>
    state.status[node] === "completed" && state.merging[node] === true,

  "resolve-conflict": (state: AbstractSystemState, node: NodeId): boolean => state.gstate[node] === "conflicted",

  remove: (state: AbstractSystemState, node: NodeId): boolean =>
    state.gstate[node] === "integrated" && state.integrated[node] === true,

  reconcile: (config: SystemModelConfig, state: AbstractSystemState, node: NodeId): boolean =>
    state.status[node] === "in_progress" &&
    state.effect[node] === "idle" &&
    state.gen[node]! < config.maxGen,

  crash: (): boolean => true,
  reopen: (): boolean => true,
} as const;

/** Apply one event to the composed model. */
export function referenceReduceSystemState(
  state: AbstractSystemState,
  event: SystemEvent,
  config: SystemModelConfig = SYSTEM_MODEL,
): AbstractSystemState {
  switch (event.type) {
    case "declare":
      require(systemGuards.declare(config, state, event.node, event.files), "declare-not-enabled", event.node);
      return {
        ...state,
        declared: set(state.declared, event.node, true),
        files: set(state.files, event.node, [...event.files]),
      };
    case "dispatch":
      require(systemGuards.dispatch(config, state, event.node), "dispatch-not-enabled", event.node);
      return {
        ...state,
        status: set(state.status, event.node, "starting"),
        gen: set(state.gen, event.node, state.gen[event.node]! + 1),
        cmd: set(state.cmd, event.node, "accepted"),
        gstate: set(state.gstate, event.node, "created"),
        registered: set(state.registered, event.node, false),
      };
    case "finish-worktree":
      require(systemGuards["finish-worktree"](state, event.node), "finish-worktree-not-enabled", event.node);
      return { ...state, registered: set(state.registered, event.node, true) };
    case "admit":
      require(systemGuards.admit(state, event.node), "admit-not-enabled", event.node);
      return {
        ...state,
        status: set(state.status, event.node, "in_progress"),
        cmd: set(state.cmd, event.node, "none"),
        effect: set(state.effect, event.node, "running"),
        effectFence: set(state.effectFence, event.node, state.gen[event.node]!),
      };
    case "check-files":
      require(systemGuards["check-files"](state, event.node), "check-files-not-enabled", event.node);
      return { ...state, checked: set(state.checked, event.node, true) };
    case "complete":
      require(
        systemGuards.settle(state, event.node) && state.checked[event.node] === true,
        "complete-not-enabled",
        event.node,
      );
      return {
        ...state,
        status: set(state.status, event.node, "completed"),
        completedGen: set(state.completedGen, event.node, state.gen[event.node]!),
        effect: set(state.effect, event.node, "idle"),
        committed: set(state.committed, event.node, true),
        gstate: set(state.gstate, event.node, "completed"),
      };
    case "block":
      require(systemGuards.settle(state, event.node), "block-not-enabled", event.node);
      return { ...state, status: set(state.status, event.node, "blocked"), effect: set(state.effect, event.node, "idle") };
    case "underspecify":
      require(systemGuards.settle(state, event.node), "underspecify-not-enabled", event.node);
      return {
        ...state,
        status: set(state.status, event.node, "underspecified"),
        effect: set(state.effect, event.node, "idle"),
      };
    case "fail":
      require(systemGuards.settle(state, event.node), "fail-not-enabled", event.node);
      return { ...state, status: set(state.status, event.node, "failed"), effect: set(state.effect, event.node, "idle") };
    case "effect-stale":
      require(systemGuards["effect-stale"](config, state, event.node), "effect-stale-not-enabled", event.node);
      return {
        ...state,
        effect: set(state.effect, event.node, "idle"),
        dropped: state.dropped + 1,
      };
    case "resume":
      require(systemGuards.resume(config, state, event.node), "resume-not-enabled", event.node);
      return {
        ...state,
        status: set(state.status, event.node, "starting"),
        gen: set(state.gen, event.node, state.gen[event.node]! + 1),
        cmd: set(state.cmd, event.node, "accepted"),
      };
    case "steer":
      require(systemGuards.steer(config, state, event.node), "steer-not-enabled", event.node);
      return {
        ...state,
        status: set(state.status, event.node, "starting"),
        gen: set(state.gen, event.node, state.gen[event.node]! + 1),
        cmd: set(state.cmd, event.node, "accepted"),
      };
    case "stop":
      require(systemGuards.stop(config, state, event.node), "stop-not-enabled", event.node);
      return {
        ...state,
        status: set(state.status, event.node, "interrupted"),
        gen: set(state.gen, event.node, state.gen[event.node]! + 1),
        cmd: set(state.cmd, event.node, "none"),
      };
    case "begin-merge":
      require(systemGuards["begin-merge"](state, event.node), "begin-merge-not-enabled", event.node);
      return { ...state, merging: set(state.merging, event.node, true) };
    case "commit-merge":
      require(systemGuards["commit-merge"](state, event.node), "commit-merge-not-enabled", event.node);
      return {
        ...state,
        integrated: set(state.integrated, event.node, true),
        merging: set(state.merging, event.node, false),
        gstate: set(state.gstate, event.node, "integrated"),
      };
    case "merge-conflict":
      require(systemGuards["merge-conflict"](state, event.node), "merge-conflict-not-enabled", event.node);
      return {
        ...state,
        gstate: set(state.gstate, event.node, "conflicted"),
        merging: set(state.merging, event.node, false),
      };
    case "resolve-conflict":
      require(systemGuards["resolve-conflict"](state, event.node), "resolve-conflict-not-enabled", event.node);
      return {
        ...state,
        gstate: set(state.gstate, event.node, "completed"),
        committed: set(state.committed, event.node, true),
      };
    case "remove":
      require(systemGuards.remove(state, event.node), "remove-not-enabled", event.node);
      return { ...state, gstate: set(state.gstate, event.node, "removed") };
    case "reconcile":
      require(systemGuards.reconcile(config, state, event.node), "reconcile-not-enabled", event.node);
      return {
        ...state,
        status: set(state.status, event.node, "starting"),
        gen: set(state.gen, event.node, state.gen[event.node]! + 1),
        cmd: set(state.cmd, event.node, "accepted"),
      };
    case "crash": {
      const merging: Record<NodeId, boolean> = {};
      for (const node of Object.keys(state.merging)) merging[node] = false;
      return { ...state, merging };
    }
    case "reopen": {
      const effect: Record<NodeId, "idle" | "running"> = {};
      for (const node of Object.keys(state.effect)) effect[node] = "idle";
      return { ...state, effect };
    }
  }
}

function require(condition: boolean, code: string, subject: string): asserts condition {
  if (!condition) throw new DagSystemError(code, `event not enabled: ${code} (${subject})`);
}

function subsets(items: readonly string[]): string[][] {
  const out: string[][] = [[]];
  for (const item of items) {
    for (const existing of [...out]) out.push([...existing, item]);
  }
  return out;
}

/** Enumerate every event enabled in a state. */
export function enabledSystemEvents(
  state: AbstractSystemState,
  config: SystemModelConfig = SYSTEM_MODEL,
): SystemEvent[] {
  const events: SystemEvent[] = [{ type: "crash" }, { type: "reopen" }];
  for (const node of config.nodes) {
    if (state.declared[node] !== true) {
      for (const files of subsets(config.fileUniverse)) {
        if (systemGuards.declare(config, state, node, files)) events.push({ type: "declare", node, files });
      }
    }
    if (systemGuards.dispatch(config, state, node)) events.push({ type: "dispatch", node });
    if (systemGuards["finish-worktree"](state, node)) events.push({ type: "finish-worktree", node });
    if (systemGuards.admit(state, node)) events.push({ type: "admit", node });
    if (systemGuards["check-files"](state, node)) events.push({ type: "check-files", node });
    if (systemGuards.settle(state, node)) {
      if (state.checked[node] === true) events.push({ type: "complete", node });
      events.push({ type: "block", node });
      events.push({ type: "underspecify", node });
      events.push({ type: "fail", node });
    }
    if (systemGuards["effect-stale"](config, state, node)) events.push({ type: "effect-stale", node });
    if (systemGuards.resume(config, state, node)) events.push({ type: "resume", node });
    if (systemGuards.steer(config, state, node)) events.push({ type: "steer", node });
    if (systemGuards.stop(config, state, node)) events.push({ type: "stop", node });
    if (systemGuards["begin-merge"](state, node)) events.push({ type: "begin-merge", node });
    if (systemGuards["commit-merge"](state, node)) events.push({ type: "commit-merge", node });
    if (systemGuards["merge-conflict"](state, node)) events.push({ type: "merge-conflict", node });
    if (systemGuards["resolve-conflict"](state, node)) events.push({ type: "resolve-conflict", node });
    if (systemGuards.remove(state, node)) events.push({ type: "remove", node });
    if (systemGuards.reconcile(config, state, node)) events.push({ type: "reconcile", node });
  }
  return events;
}

/** A single invariant failure. */
export interface SystemViolation {
  readonly invariant: string;
  readonly detail: string;
}

/** Check every invariant of the composed system. */
export function systemInvariantViolations(
  state: AbstractSystemState,
  config: SystemModelConfig = SYSTEM_MODEL,
): SystemViolation[] {
  const out: SystemViolation[] = [];
  const push = (invariant: string, detail: string): void => void out.push({ invariant, detail });
  for (const node of config.nodes) {
    const status = state.status[node]!;
    const gen = state.gen[node]!;
    const cmd = state.cmd[node]!;
    const effect = state.effect[node]!;
    const fence = state.effectFence[node]!;
    const phase = state.gstate[node]!;

    // Core invariant.
    if ((status === "starting" || status === "in_progress" || status === "completed") && !depsCompleted(config, state, node)) {
      push("DepsCompleted", `${node} is ${status} with a dependency not completed`);
    }
    if (cmd === "accepted" && status !== "starting") push("CmdImpliesStarting", `${node} accepted while ${status}`);
    if (effect === "running" && status !== "in_progress" && status !== "starting" && status !== "interrupted") {
      push("EffectRunningImpliesLive", `${node} effect running while ${status}`);
    }
    if (effect === "running" && fence < gen && status !== "starting" && status !== "interrupted") {
      push("StaleOnlyAfterInvalidation", `${node} stale effect while ${status}`);
    }
    if (status === "completed" && (effect !== "idle" || cmd !== "none" || state.completedGen[node] !== gen)) {
      push("CompletedImpliesIdle", `${node} completed with active work or wrong completedGen`);
    }
    if (status === "completed" && state.checked[node] !== true) {
      push("CompletedFilesChecked", `${node} completed without a declared-file check`);
    }
    if ((status === "blocked" || status === "underspecified") && (effect !== "idle" || cmd !== "none")) {
      push("SuspendedImpliesIdle", `${node} suspended with active work`);
    }
    if (fence > gen) push("FenceBound", `${node} fence ${fence} > gen ${gen}`);

    // Git invariant.
    if (phase === "removed" && state.integrated[node] !== true) push("NoLostWork", `${node} removed before integration`);
    if (state.integrated[node] === true && phase !== "integrated" && phase !== "removed") {
      push("IntegratedMonotonic", `${node} integrated while ${phase}`);
    }
    if (state.integrated[node] === true && state.committed[node] !== true) {
      push("CommittedBeforeIntegrated", `${node} integrated without a commit`);
    }
    if (phase === "conflicted" && state.committed[node] !== true) {
      push("ConflictKeepsCommit", `${node} conflicted without a commit`);
    }
    if (state.merging[node] === true && (status !== "completed" || state.committed[node] !== true)) {
      push("MergeOnlyAfterComplete", `${node} merging while ${status}`);
    }

    // Coupling invariant: the seams between the two halves.
    if ((status === "starting" || status === "in_progress") && !depsIntegrated(config, state, node)) {
      push("DispatchRequiresDepsIntegrated", `${node} dispatched before its dependencies were integrated`);
    }
    if ((status === "starting" || status === "in_progress") && phase !== "created") {
      push("WorktreeForRunning", `${node} ${status} without a live worktree (${phase})`);
    }
    if (status === "in_progress" && (phase !== "created" || state.registered[node] !== true)) {
      push("RegisteredBeforeRunning", `${node} running with an unregistered worktree`);
    }
    if (status === "completed" && (state.committed[node] !== true || state.registered[node] !== true)) {
      push("CompletedHasCommit", `${node} completed without a commit or worktree`);
    }
    if (state.integrated[node] === true && status !== "completed") {
      push("IntegratedImpliesCompleted", `${node} integrated while ${status}`);
    }
    if (phase !== "absent" && state.declared[node] !== true) push("WorktreeDeclared", `${node} has a worktree undeclared`);

    // File ownership.
    for (const other of config.nodes) {
      if (other !== node && !disjoint(state.files[node] ?? [], state.files[other] ?? [])) {
        push("FileOwnership", `${node} and ${other} claim overlapping files`);
      }
    }
    for (const file of state.files[node] ?? []) {
      if (!config.fileUniverse.includes(file)) push("FileUniverse", `${node} claims unknown file ${file}`);
    }

    // Induction strengthenings: true of every reachable state, needed to make
    // the safety invariant inductive for arbitrary node sets (see DagSystemProof).
    if (state.declared[node] !== true && (state.files[node] ?? []).length > 0) {
      push("UndeclaredFree", `${node} holds files while undeclared`);
    }
    if (status !== "pending" && !depsIntegrated(config, state, node)) {
      push("DepsIntegratedBeyondPending", `${node} left pending before its dependencies were integrated`);
    }
    if (SUSPENDED_STATUSES.has(status) && phase !== "created") {
      push("SuspendedHasWorktree", `${node} suspended (${status}) without a live worktree (${phase})`);
    }
    if (status !== "pending" && state.declared[node] !== true) {
      push("DispatchedDeclared", `${node} left pending while undeclared`);
    }
    if (state.merging[node] === true && state.integrated[node] === true) {
      push("MergingExcludesIntegrated", `${node} is merging and already integrated`);
    }
  }
  if (state.dropped < 0 || state.dropped > config.maxDropped) push("DroppedBound", `dropped ${state.dropped}`);
  return out;
}

/** Names of every invariant checked above. */
export const SYSTEM_INVARIANT_NAMES: readonly string[] = [
  "DepsCompleted",
  "CmdImpliesStarting",
  "EffectRunningImpliesLive",
  "StaleOnlyAfterInvalidation",
  "CompletedImpliesIdle",
  "CompletedFilesChecked",
  "SuspendedImpliesIdle",
  "FenceBound",
  "NoLostWork",
  "IntegratedMonotonic",
  "CommittedBeforeIntegrated",
  "ConflictKeepsCommit",
  "MergeOnlyAfterComplete",
  "DispatchRequiresDepsIntegrated",
  "WorktreeForRunning",
  "RegisteredBeforeRunning",
  "CompletedHasCommit",
  "IntegratedImpliesCompleted",
  "WorktreeDeclared",
  "FileOwnership",
  "FileUniverse",
  "UndeclaredFree",
  "DepsIntegratedBeyondPending",
  "SuspendedHasWorktree",
  "DispatchedDeclared",
  "MergingExcludesIntegrated",
  "DroppedBound",
];
