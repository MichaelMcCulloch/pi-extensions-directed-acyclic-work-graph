# Formal specification

There is **one** verification subject: `DagSystem.tla`, the whole DAG tool as a
single product of the scheduler machine and the worktree/integration machine,
plus declared file ownership. It is mirrored by `src/formal/system-model.ts` and
model-checked by `scripts/tla.mjs` (TLC). The two half-models it replaced are in
[`archive/`](archive/) as documentation.

## Files

| File | Role |
|---|---|
| `DagSystem.tla` | the verified machine: guards, actions, `Inv`, liveness |
| `DagSystem.cfg` | TLC configuration (`MaxGen = 2`, `MaxDropped = 4`) |
| `TraceValidation.tla` | replays implementation traces against `DagSystem`, using its named guards |
| `TraceValidation.cfg` | TLC configuration for trace validation |
| `generated/TracesData.tla` | written by `scripts/emit-traces.ts` |
| `vendor/tla2tools.jar` | pinned TLC, fetched by `scripts/tla.mjs` |

## Running

```bash
node scripts/tla.mjs model     # exhaustive safety + liveness; writes .tlc-state-count.json
node scripts/tla.mjs traces    # regenerate and validate implementation traces
```

The driver needs Java 11+ (override with `JAVA`). The JVM is a dev/CI tool only.

## What is checked

Safety (`Inv`) is the conjunction of four groups: the scheduler rules
(`CoreInv`), the worktree/integration rules (`GitInv`), the seams between them
(`CouplingInv`: `DispatchRequiresDepsIntegrated`, `WorktreeForRunning`,
`RegisteredBeforeRunning`, `CompletedHasCommit`, `IntegratedImpliesCompleted`,
`WorktreeDeclared`), and `FileOwnership` (declared file sets are pairwise
disjoint, enforced by the `Declare` guard). Liveness under fairness:
`CompletedStable`, `EffectsTerminate`, `IntegrationSettles`.

TLC explores the complete reachable state space — 2,665 distinct states, 10,690
generated, depth 23. `test/system-model.spec.ts` re-explores the same relation in
TypeScript and asserts the reachable set size equals the count TLC reports, so
the specification and the executable mirror cannot drift apart silently.

## Trace validation

`scripts/emit-traces.ts` records composed states across the chain,
crash/redelivery, blocked and underspecified resumes, conflict resolution,
steer/stale, and reopen/reconcile, and writes `generated/TracesData.tla`.
`TraceValidation.tla` walks every trace; `ActionOf`/`GuardOf` reference the named
guards of `DagSystem`, so the validator has no private copy to drift, and the
`TraceInv` invariant rejects any step that is not enabled or whose successor
state differs from the recorded one.

## Synchronizing with the implementation

`src/formal/system-model.ts` mirrors `DagSystem.tla`;
`test/spec-parity.spec.ts` checks the action list and that every action has one
named guard. Production is one durable store whose reducer is
`referenceReduceSystemState`; `scripts/emit-traces.ts` drives that store and the
traces are what TLC validates, so the conformance check is of production
behavior.
