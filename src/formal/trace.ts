/**
 * Trace generation for TLC trace validation.
 *
 * The traces are produced by driving the **production store** (`DagStore`) one
 * command at a time and recording the composed abstract state after each. The
 * store's transition IS the verified relation, so `spec/TraceValidation.tla`
 * replaying these traces checks the production reducer's command→event mapping
 * and bookkeeping against `spec/DagSystem.tla`.
 */

import { abstractSystemState } from "../engine/reducer.ts";
import type { NodeDeclaration } from "../engine/state.ts";
import type { DagStore } from "../extension/store.ts";
import { DagStore as Store } from "../extension/store.ts";
import type { AbstractSystemState, SystemEvent } from "./system-model.ts";

/** One recorded step. The first step has `event: null`. */
export interface TraceStep {
  readonly event: SystemEvent | null;
  readonly state: AbstractSystemState;
}

/** A step: one command applied to the production store, returning its event. */
export type Step = (store: DagStore) => SystemEvent;

/** A named scenario and the declaration it runs over. */
export interface Scenario {
  readonly name: string;
  readonly declaration: readonly NodeDeclaration[];
  readonly steps: readonly Step[];
}

/** The two-node chain the composed model is checked over. */
const DECLARATION: readonly NodeDeclaration[] = [
  { id: "n1", content: "first", brief: "VALIDATION: a. ACCEPTANCE: b.", deps: [] },
  { id: "n2", content: "second", brief: "VALIDATION: a. ACCEPTANCE: b.", deps: ["n1"] },
];

const dispatch = (node: string): Step => (store) => {
  store.dispatch(node, { base: "base0", worktree: `/wt/${node}`, branch: `dsh/dag/1/${node}` });
  return { type: "dispatch", node };
};
const finish = (node: string): Step => (store) => {
  store.finishWorktree(node);
  return { type: "finish-worktree", node };
};
const admit = (node: string): Step => (store) => {
  store.admit(node);
  return { type: "admit", node };
};
const complete = (node: string): Step => (store) => {
  store.settle(node, "complete", "done", `commit-${node}`);
  return { type: "complete", node };
};
const beginMerge = (node: string): Step => (store) => {
  store.beginMerge(node);
  return { type: "begin-merge", node };
};
const commitMerge = (node: string): Step => (store) => {
  store.recordMerge(node, `merge-${node}`);
  return { type: "commit-merge", node };
};
const remove = (node: string): Step => (store) => {
  store.removeNode(node);
  return { type: "remove", node };
};
const block = (node: string): Step => (store) => {
  store.settle(node, "block", "blocked");
  return { type: "block", node };
};
const underspecify = (node: string): Step => (store) => {
  store.settle(node, "underspecify", "ambiguous");
  return { type: "underspecify", node };
};
const fail = (node: string): Step => (store) => {
  store.settle(node, "fail", "boom");
  return { type: "fail", node };
};
const resume = (node: string): Step => (store) => {
  store.apply({ type: "resume", node, message: "go" });
  return { type: "resume", node };
};
const steer = (node: string): Step => (store) => {
  store.apply({ type: "steer", node, message: "replace" });
  return { type: "steer", node };
};
const stop = (node: string): Step => (store) => {
  store.apply({ type: "stop", node });
  return { type: "stop", node };
};
const effectStale = (node: string): Step => (store) => {
  store.apply({ type: "effect-stale", node });
  return { type: "effect-stale", node };
};
const reconcile = (node: string): Step => (store) => {
  store.apply({ type: "reconcile", node });
  return { type: "reconcile", node };
};
const conflict = (node: string): Step => (store) => {
  store.recordConflict(node);
  return { type: "merge-conflict", node };
};
const resolve = (node: string): Step => (store) => {
  store.resolveConflict(node, `merge-${node}`);
  return { type: "resolve-conflict", node };
};
const crash: Step = (store) => {
  store.apply({ type: "crash" });
  return { type: "crash" };
};
const reopen: Step = (store) => {
  store.reopen();
  return { type: "reopen" };
};

const boot = (node: string): Step[] => [dispatch(node), finish(node), admit(node)];
const lifecycle = (node: string): Step[] => [...boot(node), complete(node)];
const integration = (node: string): Step[] => [beginMerge(node), commitMerge(node), remove(node)];

/** The scenarios the validator replays, covering every action. */
export function scenarios(): Scenario[] {
  return [
    { name: "chain", declaration: DECLARATION, steps: [...lifecycle("n1"), ...integration("n1"), ...lifecycle("n2"), ...integration("n2")] },
    {
      name: "crash-redelivery",
      declaration: DECLARATION,
      steps: [...lifecycle("n1"), beginMerge("n1"), crash, beginMerge("n1"), commitMerge("n1"), remove("n1")],
    },
    {
      name: "blocked-resume",
      declaration: DECLARATION,
      steps: [...boot("n1"), block("n1"), resume("n1"), admit("n1"), complete("n1"), ...integration("n1")],
    },
    {
      name: "underspecified-resume",
      declaration: DECLARATION,
      steps: [...boot("n1"), underspecify("n1"), resume("n1"), admit("n1"), complete("n1"), ...integration("n1")],
    },
    {
      name: "conflict-resolve",
      declaration: DECLARATION,
      steps: [...lifecycle("n1"), beginMerge("n1"), conflict("n1"), resolve("n1"), beginMerge("n1"), commitMerge("n1"), remove("n1")],
    },
    {
      name: "steer-stale",
      declaration: DECLARATION,
      steps: [...boot("n1"), steer("n1"), effectStale("n1"), admit("n1"), complete("n1"), ...integration("n1")],
    },
    {
      name: "fail-resume",
      declaration: DECLARATION,
      steps: [...boot("n1"), fail("n1"), resume("n1"), admit("n1"), complete("n1"), ...integration("n1")],
    },
    {
      name: "reopen-reconcile",
      declaration: DECLARATION,
      steps: [...boot("n1"), reopen, reconcile("n1"), admit("n1"), complete("n1"), ...integration("n1")],
    },
    { name: "stop-stale", declaration: DECLARATION, steps: [...boot("n1"), stop("n1"), effectStale("n1")] },
  ];
}

/** Drive a scenario through the production store and record every state. */
export function runScenario(scenario: Scenario): TraceStep[] {
  const store = new Store({ append() {} });
  store.declare(scenario.declaration);
  const trace: TraceStep[] = [{ event: null, state: abstractSystemState(store.state) }];
  for (const step of scenario.steps) {
    const event = step(store);
    trace.push({ event, state: abstractSystemState(store.state) });
  }
  return trace;
}

/* -------------------------------------------------------------------------- */
/* TLA+ rendering                                                             */
/* -------------------------------------------------------------------------- */

const NODES: readonly string[] = DECLARATION.map((node) => node.id);

function quote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function bool(value: boolean): string {
  return value ? "TRUE" : "FALSE";
}

function record(render: (node: string) => string): string {
  return `[ ${NODES.map((node) => `${node} |-> ${render(node)}`).join(", ")} ]`;
}

function setLiteral(items: readonly string[]): string {
  return `{${[...items].sort().map(quote).join(", ")}}`;
}

function tlaState(state: AbstractSystemState): string {
  return [
    "[",
    `declared |-> ${record((n) => bool(state.declared[n] === true))}`,
    `, files |-> ${record((n) => setLiteral(state.files[n] ?? []))}`,
    `, status |-> ${record((n) => quote(state.status[n]!))}`,
    `, gen |-> ${record((n) => String(state.gen[n]))}`,
    `, cmd |-> ${record((n) => quote(state.cmd[n]!))}`,
    `, effect |-> ${record((n) => quote(state.effect[n]!))}`,
    `, effectFence |-> ${record((n) => String(state.effectFence[n]))}`,
    `, completedGen |-> ${record((n) => String(state.completedGen[n]))}`,
    `, dropped |-> ${state.dropped}`,
    `, gstate |-> ${record((n) => quote(state.gstate[n]!))}`,
    `, committed |-> ${record((n) => bool(state.committed[n] === true))}`,
    `, integrated |-> ${record((n) => bool(state.integrated[n] === true))}`,
    `, registered |-> ${record((n) => bool(state.registered[n] === true))}`,
    `, merging |-> ${record((n) => bool(state.merging[n] === true))}`,
    "]",
  ].join(" ");
}

function tlaEvent(event: SystemEvent | null): string {
  const fields: string[] = [`type |-> ${quote(event?.type ?? "init")}`];
  const nodeValue = event !== null && "node" in event ? event.node : "n1";
  fields.push(`node |-> ${quote(nodeValue)}`);
  const files = event !== null && event.type === "declare" ? event.files : [];
  fields.push(`files |-> ${setLiteral(files)}`);
  return `[ ${fields.join(", ")} ]`;
}

function tlaTrace(steps: readonly TraceStep[]): string {
  const records = steps.map((step) => `[ event |-> ${tlaEvent(step.event)}, state |-> ${tlaState(step.state)} ]`);
  return `<<\n  ${records.join(",\n  ")}\n>>`;
}

/** Render the generated `TracesData` module TLC consumes. */
export function renderTracesModule(traces: readonly (readonly TraceStep[])[]): string {
  const rendered = traces.map((trace, index) => `\\* trace ${index}\n${tlaTrace(trace)}`);
  return [
    "---------------------------- MODULE TracesData ----------------------------",
    "\\* Generated by scripts/emit-traces.ts. Do not edit.",
    "",
    `Traces == <<\n${rendered.join(",\n")}\n>>`,
    "",
    "=============================================================================",
    "",
  ].join("\n");
}

/** Build every scenario trace from the production store. */
export function buildTraces(): { name: string; trace: TraceStep[] }[] {
  return scenarios().map((scenario) => ({ name: scenario.name, trace: runScenario(scenario) }));
}
