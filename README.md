# pi-dag-orchestrator

A [pi](https://github.com/earendil-works/pi) extension that adds a durable
dependency-graph (`dag`) tool, built in the style of the native DAG orchestrator
in `deepseek-harness`, with one deliberate difference: **the orchestration core
is a multi-state-machine model that is formally verified with TLA+/TLC, and real
engine traces are validated against the verified machine.**

The interesting part of a DAG orchestrator is not the graph. It is what happens
when a stop, a steer, a child report, and a crash race the same node. This
project treats that coupling as the object of verification.

> **Worktrees, waves, and spawning are implemented and verified.** The single
verification subject is `spec/DagSystem.tla` (TLC, 2,665 states), mirrored by
`src/formal/system-model.ts`; the decision record is
[`DESIGN-worktrees.md`](DESIGN-worktrees.md) and the option analysis is
[`DESIGN-worktrees-options.md`](DESIGN-worktrees-options.md). The production is **one
durable store** (`src/extension/store.ts`) whose reducer is
`referenceReduceSystemState` — the transition relation TLC verifies — with
`src/engine/git.ts` performing the I/O and `src/extension/dispatcher.ts` driving
it, plus the `dag_report` control channel.

## Quick start

```bash
pnpm install
pnpm verify            # typecheck + unit/differential tests + TLC + trace validation
```

Load the extension directly during development:

```bash
pi --extension ./src/index.ts
```

Then ask the agent to `dag action=write ...`, or drive it from the model tool
surface described below.

## The model: four state machines, one product

The DAG is **not** one state machine. It is the synchronous product of four,
each owning a disjoint slice of the state:

| Machine | State | Owns |
|---|---|---|
| `GraphMachine` | `declared` | which nodes the declaration contains |
| `NodeMachine` | `status`, `gen` | node lifecycle and its monotonic fence |
| `CommandMachine` | `cmd` | the durable accepted command per node |
| `EffectMachine` | `effect`, `effectFence` | the process-local effect per node |

A fifth derived machine (`completedGen`, `dropped`) records completion
generations and stale returns. The action alphabet is shared by all of them;
coupled actions write more than one machine's variables. The machine edges are
declared in [`src/formal/machines.ts`](src/formal/machines.ts).

```
                 dispatch/resume/steer                admit
   pending ───────────────────────────▶ starting ──────────────▶ in_progress
      ▲                                   │  │                        │
      │ redispatch                        │  │ stop                   ├─ complete ─▶ completed
      │                                   │  ▼                        ├─ block    ─▶ blocked
     failed ◀── fail ─────────────────────┘ interrupted              └─ fail     ─▶ failed
        ▲                                                              │
        └──────────────── resume / steer ─────────────────────────────┘

   CommandMachine:  none ──dispatch/resume/steer──▶ accepted ──admit/stop──▶ none
   EffectMachine:   idle ──admit──▶ running ──complete/block/fail/stale/reopen──▶ idle
```

### The two races the model exists to catch

**1. A stale effect must be dropped, never applied.**
`stop` and `steer` bump the node's `gen` while an effect is still physically
running. The effect's `effectFence` is now older than `gen`. When it returns,
the only legal transition is `effect-stale`, which clears the effect slot and
increments `dropped`; it cannot touch `status`. The invariant
`StaleOnlyAfterInvalidation` proves a stale effect only exists on a node that was
stopped or steered, and `CompletedGenMatches` proves a completion always belongs
to the current generation.

**2. A crash loses process-local effects but not durable intent.**
`reopen` resets every `effect` to `idle` and changes nothing else; an accepted
command survives, and `reconcile` re-arms a node that was left `in_progress`
without an effect. The liveness properties below prove that no accepted command
and no running effect is stranded.

## Formal verification

There is **one** verification subject: the whole DAG tool as a single product,
in [`spec/DagSystem.tla`](spec/DagSystem.tla), mirrored by
[`src/formal/system-model.ts`](src/formal/system-model.ts).

```bash
pnpm verify:model     # TLC exhaustive safety + liveness over the one model
pnpm verify:traces    # regenerate implementation traces, TLC-validate them
pnpm verify:formal    # both
```

### What TLC proves

TLC explores the **complete reachable state space of the composed machine —
2,665 distinct states, 10,690 generated**, depth 23 — and checks the product of
the scheduler and the worktree/integration machines, including the seams:

**Safety (`Inv`)**

| Invariant | Meaning |
|---|---|
| `DepsCompleted`, `CmdImpliesStarting`, `EffectRunningImpliesLive`, `StaleOnlyAfterInvalidation`, `CompletedImpliesIdle`, `SuspendedImpliesIdle`, `FenceBound` | the scheduler machine's rules |
| `NoLostWork`, `IntegratedMonotonic`, `CommittedBeforeIntegrated`, `ConflictKeepsCommit`, `MergeOnlyAfterComplete` | the worktree/integration machine's rules |
| `DispatchRequiresDepsIntegrated` | a node starts only when every dependency is **integrated**, not merely completed |
| `WorktreeForRunning` / `RegisteredBeforeRunning` | a dispatched node has a live worktree; a running node a registered one |
| `CompletedHasCommit` / `IntegratedImpliesCompleted` | completion implies a commit; integration implies completion |
| `FileOwnership` | declared file sets are pairwise disjoint in every reachable state |

**Liveness** (`WF` on `FinishWorktree`, `EffectReturns`, `BeginMerge`; `SF` on
the settle step): `CompletedStable`, `EffectsTerminate`, `IntegrationSettles`.

The two earlier half-models are retired to [`spec/archive/`](spec/archive/) as
documentation. Consolidating them into one product removed the refinement
obligation between three models: with a single subject there is no "is this a
projection of that" step, and every action has one named guard shared by the
actions and the trace validator.

### How the proof reaches the implementation

1. **The spec is executable.** `src/formal/system-model.ts` transcribes
   `DagSystem.tla`; `test/system-model.spec.ts` explores it exhaustively and
   asserts the reachable set is **exactly 2,665 states** — the number TLC
   reports. Drift changes the count and fails the test.
2. **Production is the verified relation.** One durable store
   (`src/extension/store.ts`) owns the composed state, and its reducer is
   `referenceReduceSystemState` — the same relation TLC verifies. There is no
   second store and no bridge: the scheduler/worktree interaction is internal to
   the proof. `src/engine/git.ts` performs the I/O and the dispatcher maps git
   outcomes to model events (`commit-merge`, `merge-conflict`,
   `resolve-conflict`).
3. **Production traces are model behaviors.** `scripts/emit-traces.ts` drives
   the real `DagStore` through every action — chain, crash/redelivery,
   blocked/underspecified resumes, conflict resolution, steer/stale,
   reopen/reconcile — and records the composed state after each command;
   `spec/TraceValidation.tla` replays them against `DagSystem` using its named
   guards.

```
  DagSystem.tla ──TLC──▶ safety + liveness of the composed machine
        │ same transition relation
        ▼
  src/formal/system-model.ts ──count cross-check──▶ 2,665 states
        │ used directly by
        ▼
  DagStore (one state) ──▶ production traces ──TLC──▶ TraceValidation.tla
```

### The TLA+ toolchain

TLC ships as a JVM jar. `scripts/tla.mjs` finds a Java 11+ runtime (override with
`JAVA`), uses `TLA2TOOLS_JAR` or `spec/vendor/tla2tools.jar`, and otherwise
downloads the pinned release `v1.8.0`. The JVM is a **dev/CI tool only**; the
extension runtime is pure TypeScript.

### Scope of the proof

What TLC and the conformance links cover: the concurrent execution state
machine — node lifecycle, durable command, process-local effect, declaration
membership, fences, crash recovery, and the races between them.

What is deliberately outside the verified core and handled as pure,
non-concurrent functions with their own tests:

- **Graph declaration.** `write`/`amend` validation (acyclicity, dependency
existence, brief sections, immutability of non-pending nodes) is a synchronous
function in [`src/engine/state.ts`](src/engine/state.ts). It cannot be entered
while the machines are mid-transition, so it is not part of the product state.
- **Wave scheduling and Git execution.** This extension is the control plane.
It does not run Git or create subagents; a node's effect is settled by the
orchestrating agent calling `complete`/`block`/`fail`, or by wiring a worker at
the `DagEffect` boundary in [`src/engine/reducer.ts`](src/engine/reducer.ts).
The fence arithmetic a worker must respect is exactly what `DagStore.settle`
enforces and what `CompletedGenMatches` proves.
- **Durability of the session log.** Snapshots are pi custom entries; the
session store owns atomic append, not this extension.

The model is bounded (`MaxGen=4`, `MaxDropped=12`) and uses a fixed three-node
chain. Raising the bounds or changing the topology is a `.cfg`/module edit; the
TS model and the TLC config are kept in sync by the state-count cross-check.

## The `dag` tool

One tool with an `action` discriminator. State is stored in the pi session as a
`dag/state` custom entry, so branching rewinds the graph.

| Action | Effect |
|---|---|
| `write` | declare or amend the complete node list (validated, deps acyclic) |
| `status` | read the board, counts, and ready set |
| `inspect` | read one node's durable execution facts |
| `dispatch` | start dependency-ready nodes; arms then admits each effect |
| `complete` / `block` / `fail` | settle the running effect; a stale report is dropped |
| `stop` | interrupt and invalidate the running effect's fence |
| `resume` / `steer` | restart or replace work |
| `redispatch` | return a failed node to `pending` |
| `reopen` | apply the process-death transition (effects dropped) |
| `recover` | `reopen` plus re-arm every node that was left `in_progress` |

The model never sees runtime-only transitions (`admit`, `effect-stale`,
`reconcile`); the store applies them. In particular
[`DagStore.settle`](src/extension/store.ts) re-checks `effectFence === gen`
before applying a child report, so a late `complete` is routed to the stale
branch. That is the formal property `CompletedGenMatches` enforced in production.

## Layout

```
src/
  formal/
    model.ts        executable abstract model: guards, actions, reference reducer, invariant
    machines.ts     the four machine specs and their edges
    trace.ts        scenario runner and TLA+ trace rendering
  engine/
    state.ts        durable state, declaration validation, board projection
    reducer.ts      production reducer, effects, abstract projection
    verify.ts       production invariant (abstract + bookkeeping)
  extension/
    store.ts        durable store over the reducer; fence-checked settlement
    tool.ts         the model-facing `dag` tool
  index.ts          pi extension entry (persistence, tool, /dag command)
spec/
  DagSystem.tla / .cfg          the one verified machine
  TraceValidation.tla / .cfg    implementation trace validation
  archive/                      retired half-models, kept as documentation
  generated/                    traces emitted from the real engine
scripts/
  tla.mjs                       TLC driver
  emit-traces.ts                trace emitter
test/
  model.spec.ts                 exhaustive state-space + TLC count cross-check
  conformance.spec.ts           production vs reference differential oracle
  store.spec.ts, tool.spec.ts, extension.spec.ts, machines.spec.ts, spec-parity.spec.ts
```

## Relationship to `deepseek-harness`

The command surface, durable-snapshot design, and fence semantics mirror the
native DAG orchestrator in the `worktree/native-dag-orchestrator` branch of
`deepseek-harness`. That branch's
[transition-verification note](../../deepseek-harness/.agents/notes/proposed/testing/2026-09-21-dag-transition-verification.md)
explicitly considered and **rejected** a machine-checked specification
("TLA+, Alloy, or Quint") as theatre. This project takes the opposite position
for a smaller core: because the model is small, total, and decoupled from I/O,
the specification is cheap, and TLC proves properties the bounded JS search
cannot — including the liveness properties and the crash interleavings.
