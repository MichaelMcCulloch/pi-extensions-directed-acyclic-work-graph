/**
 * The single durable DAG store.
 *
 * It owns one state — the composed scheduler + worktree machine — and every
 * mutation is a command whose transition is `referenceReduceSystemState`, the
 * mirror of `spec/DagSystem.tla`. There is no second store and no bridge: the
 * domain interaction is internal to the verified relation.
 *
 * Git side effects are performed by the dispatcher with `src/engine/git.ts`;
 * the store records the resulting facts and applies the corresponding model
 * event, so the durable state is always a model state.
 */

import { projectBoard, type DagBoard } from "../engine/projection.ts";
import { isEnabled, reduceCommand, type DagCommand, type DagEffect, type ReduceResult } from "../engine/reducer.ts";
import {
  applyDeclaration,
  initDagState,
  normalizeDagState,
  validateDeclaration,
  type DagState,
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

  public violations(): readonly { invariant: string; detail: string }[] {
    return invariantViolations(this.#state);
  }

  /** Declare or amend the graph, preserving surviving machine and git fields. */
  public declare(declaration: readonly NodeDeclaration[]): OperationResult {
    const errors = validateDeclaration(this.#state, declaration);
    if (errors.length > 0) throw new DagOperationError("dag-invalid-declaration", errors.join("; "));
    this.#state = applyDeclaration(this.#state, declaration);
    this.#commit();
    return { state: this.#state, effects: [], board: this.board };
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
