/**
 * The single durable DAG store.
 *
 * It owns one state — the composed scheduler + worktree machine — and every
 * runtime mutation is a command whose transition is `referenceReduceSystemState`,
 * the mirror of `spec/DagSystem.tla`. Declaration is a synchronous, idempotent
 * merge-by-id layer that stages a new state and then feeds the resulting
 * `declare`/`adopt`/`orphan`/`amend`/`mark-stale` events through the same
 * relation, so the durable state is always a model state.
 *
 * Git side effects are performed by the dispatcher with `src/engine/git.ts`;
 * the store records the resulting facts and applies the corresponding model
 * event.
 */

import { projectBoard, projectPlan, type DagBoard, type DagPlan } from "../engine/projection.ts";
import { isEnabled, reduceCommand, type DagCommand, type DagEffect, type ReduceResult } from "../engine/reducer.ts";
import {
  initDagState,
  normalizeDagState,
  resolveDeclarations,
  validateDeclaration,
  type DagNode,
  type DagState,
  type DeclarationDiff,
  type DeclarationEvent,
  type DeclarationInput,
  type DeclarationOptions,
  type NodeDeclaration,
  type NodeId,
} from "../engine/state.ts";
import { invariantViolations } from "../engine/verify.ts";
import { DagSystemError } from "../formal/system-model.ts";

/** Where snapshots go. `pi.appendEntry` in production, an array in tests. */
export interface DagPersistence {
  append(snapshot: DagState): void;
}

/** The settlement outcomes a node effect can report. */
export type NodeOutcome = "complete" | "block" | "underspecify" | "fail";

/** The result of a high-level operation. */
export interface OperationResult {
  readonly state: DagState;
  readonly effects: readonly DagEffect[];
  readonly board: DagBoard;
}

/** A declaration result, including the diff and warnings. */
export interface DeclarationResult extends OperationResult {
  readonly diff: DeclarationDiff;
  readonly warnings: readonly string[];
  readonly applied: boolean;
}

/** A settlement result naming the transition selected. */
export interface SettleResult extends OperationResult {
  readonly settlement: string;
}

/** A store error carrying a stable code. */
export class DagOperationError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DagOperationError";
  }
}

/** Git facts observed by the dispatcher when it dispatches a node. */
export interface DispatchFacts {
  readonly base: string;
  readonly worktree: string;
  readonly branch: string;
}

/** Options accepted by `write`/`add`. */
export interface DeclareOptions extends DeclarationOptions {
  readonly dryRun?: boolean;
  readonly expectRevision?: number;
}

/** A single-node definition patch for `edit`. */
export interface NodeEdit {
  readonly content?: string;
  readonly brief?: string;
  readonly deps?: readonly string[];
  readonly kind?: "task" | "integration";
  readonly files?: readonly string[];
  readonly policy?: "delegate" | "ours" | "theirs" | "halt";
  readonly noop?: boolean;
}

function eventToCommand(event: DeclarationEvent): DagCommand {
  switch (event.kind) {
    case "declare":
      return { type: "declare", node: event.node, files: event.files };
    case "adopt":
      return { type: "adopt", node: event.node, files: event.files };
    case "amend":
      return { type: "amend", node: event.node, files: event.files };
    case "mark-stale":
      return { type: "mark-stale", node: event.node };
    case "orphan":
      return { type: "orphan", node: event.node };
  }
}

function patchNode(state: DagState, node: NodeId, patch: Partial<DagNode>): DagState {
  const existing = state.nodes[node];
  if (existing === undefined) return state;
  return { ...state, nodes: { ...state.nodes, [node]: { ...existing, ...patch } } };
}

/** The durable store. */
export class DagStore {
  #state: DagState;
  readonly #persistence: DagPersistence;

  public constructor(persistence: DagPersistence, initial: DagState = initDagState()) {
    this.#persistence = persistence;
    // Snapshots can predate the current machine fields; migrate on load so a
    // restored session satisfies the present invariant instead of bricking.
    this.#state = normalizeDagState(initial);
  }

  public get state(): DagState {
    return this.#state;
  }

  public get board(): DagBoard {
    return projectBoard(this.#state);
  }

  public get plan(): DagPlan {
    return projectPlan(this.#state);
  }

  public violations(): readonly { invariant: string; detail: string }[] {
    return invariantViolations(this.#state);
  }

  /**
   * Declare or amend the graph. `write` (default) declares the whole node set
   * and orphans nodes absent from it; `add` upserts only the given nodes.
   * Unchanged nodes are untouched. A definition change to a node that has left
   * pending marks it `stale`; an integrated node's definition cannot change.
   */
  public declare(declaration: readonly DeclarationInput[], options: DeclareOptions = {}): DeclarationResult {
    if (options.expectRevision !== undefined && options.expectRevision !== this.#state.revision) {
      throw new DagOperationError(
        "dag-stale-revision",
        `expected revision ${options.expectRevision}, current revision is ${this.#state.revision}`,
      );
    }
    const resolved = resolveDeclarations(this.#state, declaration);
    const validation = validateDeclaration(this.#state, resolved.declarations, options);
    const errors = [...resolved.errors, ...validation.errors];
    if (errors.length > 0) {
      throw new DagOperationError("dag-invalid-declaration", errors.join("; "));
    }
    if (options.dryRun === true) {
      return {
        state: this.#state,
        effects: [],
        board: this.board,
        diff: validation.diff,
        warnings: validation.warnings,
        applied: false,
      };
    }
    this.#applyStaged(validation.state, validation.events);
    return {
      state: this.#state,
      effects: [],
      board: this.board,
      diff: validation.diff,
      warnings: validation.warnings,
      applied: true,
    };
  }

  /** Upsert a subset of nodes without disturbing absent ones. */
  public add(declaration: readonly DeclarationInput[], options: DeclareOptions = {}): DeclarationResult {
    return this.declare(declaration, { ...options, mode: "add" });
  }

  /** Change one node's definition, marking it stale if it has left pending. */
  public edit(node: NodeId, patch: NodeEdit, options: DeclareOptions = {}): DeclarationResult {
    const existing = this.#state.nodes[node];
    if (existing === undefined) throw new DagOperationError("dag-unknown-node", `unknown node ${node}`);
    const declaration: NodeDeclaration = {
      id: node,
      content: patch.content ?? existing.content,
      brief: patch.brief ?? existing.brief,
      deps: patch.deps ?? existing.deps,
      kind: patch.kind ?? existing.kind,
      files: patch.files ?? existing.files,
      policy: patch.policy ?? existing.policy,
      noop: patch.noop ?? existing.noop,
    };
    return this.declare([declaration], { ...options, mode: "add" });
  }

  /** Add dependency edges to a pending node. */
  public link(node: NodeId, deps: readonly NodeId[]): DeclarationResult {
    const existing = this.#state.nodes[node];
    if (existing === undefined) throw new DagOperationError("dag-unknown-node", `unknown node ${node}`);
    const merged = [...existing.deps];
    for (const dep of deps) if (!merged.includes(dep)) merged.push(dep);
    return this.edit(node, { deps: merged });
  }

  /** Remove dependency edges from a pending node. */
  public unlink(node: NodeId, deps: readonly NodeId[]): DeclarationResult {
    const existing = this.#state.nodes[node];
    if (existing === undefined) throw new DagOperationError("dag-unknown-node", `unknown node ${node}`);
    const remove = new Set(deps);
    return this.edit(node, { deps: existing.deps.filter((dep) => !remove.has(dep)) });
  }

  /** Physically delete a node that nothing remaining depends on. */
  public prune(node: NodeId): DeclarationResult {
    const state = this.#state;
    // Only active nodes are re-declared; already-orphaned nodes are left alone
    // rather than resurrected by the write.
    const declaration = state.order
      .filter((id) => id !== node && state.nodes[id]!.orphaned !== true)
      .map((id) => {
        const n = state.nodes[id]!;
        return {
          id,
          content: n.content,
          brief: n.brief,
          deps: n.deps,
          kind: n.kind,
          files: n.files,
          policy: n.policy,
          noop: n.noop,
        };
      });
    return this.declare(declaration, { mode: "write", prune: true });
  }

  /** Manually park a pending node on an external condition. */
  public park(node: NodeId, reason: string): OperationResult {
    const current = this.#state.nodes[node];
    if (current === undefined) throw new DagOperationError("dag-unknown-node", `unknown node ${node}`);
    if (!isEnabled(this.#state, { type: "park", node })) {
      throw new DagOperationError("dag-transition-refused", `cannot block ${node} in status ${current.status}`);
    }
    this.#state = patchNode(this.#state, node, { blockedReason: reason });
    return this.#apply({ type: "park", node });
  }

  /** Lift a manual block. */
  public unpark(node: NodeId): OperationResult {
    const current = this.#state.nodes[node];
    if (current === undefined) throw new DagOperationError("dag-unknown-node", `unknown node ${node}`);
    if (!isEnabled(this.#state, { type: "unpark", node })) {
      throw new DagOperationError("dag-transition-refused", `cannot unblock ${node} in status ${current.status}`);
    }
    this.#state = patchNode(this.#state, node, { blockedReason: null });
    return this.#apply({ type: "unpark", node });
  }

  /** Reset a stale node so its new definition can run. */
  public reset(node: NodeId): OperationResult {
    const current = this.#state.nodes[node];
    if (current === undefined) throw new DagOperationError("dag-unknown-node", `unknown node ${node}`);
    if (!isEnabled(this.#state, { type: "reset", node })) {
      throw new DagOperationError("dag-transition-refused", `cannot reset ${node} in status ${current.status}`);
    }
    return this.#apply({ type: "reset", node });
  }

  /** True when the composed model accepts a dispatch for this node. */
  public canDispatch(node: NodeId): boolean {
    return this.#state.nodes[node] !== undefined && isEnabled(this.#state, { type: "dispatch", node });
  }

  /** Dispatch a node: record the base/worktree facts and apply the event. */
  public dispatch(node: NodeId, facts: DispatchFacts): OperationResult {
    return this.#apply({ type: "dispatch", node, base: facts.base, worktree: facts.worktree, branch: facts.branch });
  }

  /** Mark the worktree registration complete after `git worktree add`. */
  public finishWorktree(node: NodeId): OperationResult {
    return this.#apply({ type: "finish-worktree", node });
  }

  /** Start the effect. */
  public admit(node: NodeId): OperationResult {
    return this.#apply({ type: "admit", node });
  }

  /** Settle a node effect with the outcome the child reported. */
  public settle(node: NodeId, outcome: NodeOutcome, detail: string, completedCommit?: string): SettleResult {
    const command: DagCommand =
      outcome === "complete"
        ? { type: "complete", node, completedCommit: completedCommit ?? "" }
        : outcome === "block"
          ? { type: "block", node, reason: detail }
          : outcome === "underspecify"
            ? { type: "underspecify", node, question: detail }
            : { type: "fail", node, error: detail };
    const result = this.#reduce(command);
    return {
      state: result.state,
      effects: result.effects,
      board: this.board,
      settlement: result.events.at(-1)?.type ?? outcome,
    };
  }

  /** Record that the dispatcher validated the completion against declared files. */
  public checkFiles(node: NodeId): OperationResult {
    return this.#apply({ type: "check-files", node });
  }

  /** Begin the two-phase integration. */
  public beginMerge(node: NodeId): OperationResult {
    return this.#apply({ type: "begin-merge", node });
  }

  /** Record a committed integration and its merge commit. */
  public recordMerge(node: NodeId, mergeCommit: string): OperationResult {
    return this.#apply({ type: "commit-merge", node, mergeCommit });
  }

  /** Record that the merge conflicted. */
  public recordConflict(node: NodeId): OperationResult {
    return this.#apply({ type: "merge-conflict", node });
  }

  /** Record a resolver's committed resolution. */
  public resolveConflict(node: NodeId, mergeCommit: string): OperationResult {
    return this.#apply({ type: "resolve-conflict", node, mergeCommit });
  }

  /** Record that the worktree was removed. */
  public removeNode(node: NodeId): OperationResult {
    return this.#apply({ type: "remove", node });
  }

  /** Apply one arbitrary command (used by tests and recovery). */
  public apply(command: DagCommand): OperationResult {
    return this.#apply(command);
  }

  /** Replace the durable state, e.g. when restoring a recovered snapshot. */
  public restore(state: DagState): OperationResult {
    this.#state = state;
    this.#commit();
    return { state: this.#state, effects: [], board: this.board };
  }

  /** Apply the process-death transition: drop every process-local effect. */
  public reopen(): OperationResult {
    return this.#apply({ type: "reopen" });
  }

  /** Recover after process death: drop effects and re-arm in-progress nodes. */
  public recover(): OperationResult {
    // Process death clears both process-local domains: in-progress merges and
    // running effects. Then in-progress nodes are re-armed from durable state.
    this.#reduce({ type: "crash" });
    this.#reduce({ type: "reopen" });
    for (const id of this.#state.order) {
      if (isEnabled(this.#state, { type: "reconcile", node: id })) {
        this.#reduce({ type: "reconcile", node: id });
      }
    }
    return { state: this.#state, effects: [], board: this.board };
  }

  /** Apply a staged declaration: patch is already in `staged`, then events. */
  #applyStaged(staged: DagState, events: readonly DeclarationEvent[]): void {
    let next = staged;
    for (const event of events) {
      const command = eventToCommand(event);
      try {
        next = reduceCommand(next, command).state;
      } catch (error) {
        if (error instanceof DagSystemError) {
          throw new DagOperationError("dag-transition-refused", error.message);
        }
        throw error;
      }
    }
    this.#state = next;
    this.#commit();
  }

  #apply(command: DagCommand): OperationResult {
    const result = this.#reduce(command);
    return { state: result.state, effects: result.effects, board: this.board };
  }

  #reduce(command: DagCommand): ReduceResult {
    try {
      const result = reduceCommand(this.#state, command);
      if (result.state !== this.#state) {
        this.#state = result.state;
        this.#commit();
      }
      return result;
    } catch (error) {
      if (error instanceof DagSystemError) {
        throw new DagOperationError("dag-transition-refused", error.message);
      }
      throw error;
    }
  }

  #commit(): void {
    const violations = this.violations();
    if (violations.length > 0) {
      throw new DagOperationError(
        "dag-invariant-violation",
        violations.map((violation) => `${violation.invariant}: ${violation.detail}`).join("; "),
      );
    }
    this.#persistence.append(this.#state);
  }
}
