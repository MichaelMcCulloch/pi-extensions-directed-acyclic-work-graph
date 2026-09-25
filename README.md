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
verification subject is `spec/DagSystem.tla` (TLC fixture, 3,946 states;
`spec/DagSystemProof.tla` proves `Spec => []Inv` for arbitrary constants),
mirrored by
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

## The model: one composed system

There is **one** verification subject: `spec/DagSystem.tla` owns the whole
state at once — declaration membership, node lifecycle and fences, the durable
command, the process-local effect, worktree/integration phase, and declared
file ownership:

| State | Owns |
|---|---|
| `declared`, `files` | which nodes the declaration contains and which files each claims |
| `status`, `gen`, `completedGen` | node lifecycle and its monotonic fence |
| `cmd` | the durable accepted command per node |
| `effect`, `effectFence`, `dropped` | the process-local effect per node and stale returns |
| `gstate`, `committed`, `integrated`, `registered`, `merging`, `checked` | the worktree/integration phase and its git facts |

Every action has exactly one named guard, shared by the action and by the trace
validator, so the executable model and the specification cannot diverge. The two
earlier half-models are retired to [`spec/archive/`](spec/archive/); with a
single subject there is no refinement obligation between models.

```
                dispatch/resume/steer/reconcile      admit
   pending ────────────────────────────────▶ starting ─────────▶ in_progress
                                               │   │                 │
                              resume/steer ────┘   │ stop            ├─ complete ─▶ completed
                                                  ▼                 ├─ block    ─▶ blocked
                                             interrupted            ├─ underspecify ─▶ underspecified
                                                                    └─ fail     ─▶ failed

   command:  none ──dispatch/resume/steer/reconcile──▶ accepted ──admit/stop──▶ none
   effect:   idle ──admit──▶ running ──settle/underspecify/stale/reopen──▶ idle
   worktree: absent ─dispatch─▶ created ─complete─▶ completed ─commit─▶ integrated ─remove─▶ removed
   conflict: completed ─merge-conflict─▶ conflicted ─resolve─▶ completed
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
pnpm verify:model     # TLC exhaustive safety + liveness over the fixture
pnpm verify:traces    # regenerate implementation traces, TLC-validate them
pnpm verify:formal    # both
pnpm verify:proof     # TLAPS inductive proof: Spec => []Inv for all constants
pnpm verify           # typecheck + tests + TLC + traces + proof
```

### What TLC proves

TLC explores the **complete reachable state space of the composed machine —
3,946 distinct states, 15,664 generated** — and checks the product of the
scheduler and the worktree/integration machines, including the seams:

**Safety (`Inv`)**

| Invariant | Meaning |
|---|---|
| `DepsCompleted`, `CmdImpliesStarting`, `EffectRunningImpliesLive`, `StaleOnlyAfterInvalidation`, `CompletedImpliesIdle`, `SuspendedImpliesIdle`, `FenceBound` | the scheduler machine's rules |
| `NoLostWork`, `IntegratedMonotonic`, `CommittedBeforeIntegrated`, `ConflictKeepsCommit`, `MergeOnlyAfterComplete` | the worktree/integration machine's rules |
| `DispatchRequiresDepsIntegrated` | a node starts only when every dependency is **integrated**, not merely completed |
| `WorktreeForRunning` / `RegisteredBeforeRunning` | a dispatched node has a live worktree; a running node a registered one |
| `CompletedHasCommit` / `IntegratedImpliesCompleted` | completion implies a commit; integration implies completion |
| `FileOwnership` | declared file sets are pairwise disjoint in every reachable state |
| `UndeclaredFree`, `DepsIntegratedBeyondPending`, `SuspendedHasWorktree`, `DispatchedDeclared`, `MergingExcludesIntegrated` | the induction strengthenings: true of every reachable state, and what makes `Inv` inductive for arbitrary N |

**Liveness** (`WF` on `FinishWorktree`, `EffectReturns`, `BeginMerge`; `SF` on
the settle step): `CompletedStable`, `EffectsTerminate`, `IntegrationSettles`.

### What TLAPS proves: a theorem in N

`DagSystem` is parameterized by the constants `Nodes`, `Edges`, `Files`,
`MaxGen`, and `MaxDropped`. [`spec/DagSystemProof.tla`](spec/DagSystemProof.tla)
proves, by induction,

```
THEOREM Safety == ASSUME MaxGen \in Nat, MaxDropped \in Nat PROVE Spec => []Inv
```

`Init => Inv`, and each of the 22 actions preserves each of the 10 invariant
components (510 obligations, all discharged by tlapm). This holds for **every**
node set and dependency relation — the TLC fixture is only the executable
check and the liveness/count cross-check. The two side conditions
(`MaxGen ∈ Nat`, `MaxDropped ∈ Nat`) are what the fixture made implicit by
instantiating numerals. `pnpm verify:proof` runs the proof.

### How the proof reaches the implementation

1. **The spec is executable.** `src/formal/system-model.ts` transcribes
   `DagSystem.tla`; `test/system-model.spec.ts` explores it exhaustively and
   asserts the reachable set is **exactly 3,946 states** — the number TLC
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
  DagSystem.tla ──TLC──▶ safety + liveness of the composed machine (fixture)
        │  └──TLAPS──▶ []Inv for ALL Nodes, Edges, Files, MaxGen, MaxDropped
        │ same transition relation
        ▼
  src/formal/system-model.ts ──count cross-check──▶ 3,946 states
        │ used directly by
        ▼
  DagStore (one state) ──▶ production traces ──TLC──▶ TraceValidation.tla
```

### The TLA+ toolchain

TLC ships as a JVM jar. `scripts/tla.mjs` finds a Java 11+ runtime (override with
`JAVA`), uses `TLA2TOOLS_JAR` or `spec/vendor/tla2tools.jar`, and otherwise
downloads the pinned release `v1.8.0`. The inductive proof needs tlapm 1.6+
(and a Z3 on `PATH`); `scripts/tlapm.mjs` locates both, honouring `TLAPM` and
`TLAPM_LIBRARY`. Both are **dev/CI tools only**; the extension runtime is pure
TypeScript.

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
- **Git and child processes.** The extension *does* drive Git and spawn nested
agents. That I/O boundary is the named residual: every Git outcome is mapped to
a model event (`commit-merge`, `merge-conflict`, `resolve-conflict`, or a
failure that stops the node), and [`src/engine/git.ts`](src/engine/git.ts) is
tested directly. What is proved is that the model's integration phase is safe
for every sequence of those outcomes; that the OS, git, and a child process
behave as their contracts say is not.
- **Durability of the session log.** Snapshots are pi custom entries; the
session store owns atomic append, not this extension.

The safety invariant holds for arbitrary `Nodes`, `Edges`, `Files`, `MaxGen`,
and `MaxDropped` (TLAPS). TLC still runs the fixture (`MaxGen = 2`,
`MaxDropped = 4`, two nodes) to check the liveness properties and to cross-check
the executable model's state count; **liveness for arbitrary N is not proved**.
Child-process sandboxing and cryptographic unforgeability remain
environment-bound.

## The `dag` tool

One tool with an `action` discriminator. State is stored in the pi session as a
`dag/state` custom entry, so branching rewinds the graph.

| Action | Effect |
|---|---|
| `write` | declare or amend the complete node list (validated, deps acyclic) |
| `status` | read the board, counts, and ready set |
| `inspect` | read one node's durable execution facts |
| `run` | dispatch every ready node into a git worktree, spawn a nested `pi`, validate its commit, integrate it (fast-forward, else merge commit), and settle the node |

Transitions the tool does not expose directly (`admit`, `effect-stale`,
`reconcile`, `crash`, `reopen`) are applied by the store and dispatcher, which
drive the same verified relation. In particular
[`DagStore`](src/extension/store.ts) re-checks `effectFence === gen` before
applying a child report, so a late completion is routed to the stale branch —
what `StaleOnlyAfterInvalidation` and `CompletedGenMatches` prove.

## Layout

```
src/
  formal/
    system-model.ts the executable mirror of spec/DagSystem.tla: guards, actions, reference reducer, invariants
    trace.ts        scenario runner and TLA+ trace rendering
  engine/
    state.ts        durable state, declaration validation, board projection
    reducer.ts      production reducer over the reference relation
    projection.ts   production state -> abstract state
    verify.ts       production invariant diagnostics
    git.ts          git I/O boundary: worktrees, completion validation, integration
  extension/
    store.ts        the single durable store; recovery is Crash + Reopen + Reconcile
    dispatcher.ts   concurrent dispatch, child spawning, settlement, conflict policy
    dag-report.ts   the child's report tool and result file
    tool.ts         the model-facing `dag` tool
  index.ts          pi extension entry (persistence, tool, /dag command)
spec/
  DagSystem.tla              the one verified machine (parameterized by constants)
  DagSystemFixture.tla/.cfg  the TLC fixture (two nodes, one edge, two files)
  DagSystemProof.tla         the TLAPS inductive proof: Spec => []Inv for all N
  TraceValidation.tla/.cfg   implementation trace validation
  archive/                   retired half-models, kept as documentation
  generated/                 traces emitted from the real engine
scripts/
  tla.mjs                    TLC driver
  tlapm.mjs                  TLAPS proof driver
  emit-traces.ts             trace emitter
test/
  system-model.spec.ts       exhaustive state-space + TLC count cross-check
  spec-parity.spec.ts        TLA+/TS definition parity
  store, tool, dispatcher, git, recovery, extension specs
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
