# DAG worktrees, waves, and spawning — locked decisions

Companion to `DESIGN-worktrees-options.md` (the option analysis). These are the
decisions, restated as implementation constraints.

## Verification architecture

There is **one** TLA+ subject and **one** executable mirror:

| Artifact | Role |
|---|---|
| `spec/DagSystem.tla` | the whole DAG tool as one product: scheduler + worktree/integration + declared file ownership, with the coupling invariants |
| `spec/DagSystemProof.tla` | the TLAPS inductive proof: `Spec => []Inv` for **arbitrary** `Nodes`, `Edges`, `Files`, `MaxGen`, `MaxDropped` (510 obligations) |
| `src/formal/system-model.ts` | the executable mirror of that product |
| `test/system-model.spec.ts` | exhaustive exploration + count cross-check: the mirror reaches exactly the TLC count |

TLC verifies **3,946 distinct reachable states** on the fixture with safety and
liveness. TLAPS then proves that the safety invariant is inductive, so `[]Inv`
holds for **every** node set and dependency relation, not just the fixture. The
invariants that only the product can state are the point:

- `DispatchRequiresDepsIntegrated` — a node starts only when every dependency is
  git-`integrated`, not merely core-`completed`;
- `WorktreeForRunning` / `RegisteredBeforeRunning` — a dispatched node has a live
  worktree, and a running node a registered one;
- `CompletedHasCommit`, `IntegratedImpliesCompleted`, `RemovedImpliesIntegrated`,
  `NoLostWork` — the completion → integration → removal order;
- `FileOwnership` — declared file sets are pairwise disjoint, enforced by the
  `Declare` guard so it holds in every reachable state.

The previous half-models (`DagOrchestrator.tla`, `DagGit.tla`) are retired to
`spec/archive/` as documentation. Consolidating removed the refinement
obligation between three models: with one product there is no "is this a
projection of that" step left to skip, and there is one guard definition per
action, shared by the actions and the trace validator.

Production is **one durable store** (`src/engine/state.ts`, `src/engine/reducer.ts`,
`src/extension/store.ts`): it owns the composed state, and its reducer is
`referenceReduceSystemState` — the mirror of the verified relation. There is no
second store and no bridge: the scheduler/worktree interaction is internal to
the transition relation TLC checks. `src/engine/git.ts` performs the I/O, and the
dispatcher maps git outcomes to model events (`commit-merge`, `merge-conflict`,
`resolve-conflict`).

The collapse followed two seam defects the two-store design exposed:

1. `DagDispatcher.run` dispatched on the core readiness rule and only then asked
   the worktree layer to prepare, stranding a node when its dependency was
   completed but not integrated. The model's `DispatchRequiresDepsIntegrated`
   guard now makes that state unreachable, and the dispatcher returns `not-ready`.
2. The production git layer modelled `blocked`/`underspecified` as *worktree
   phases* while the composed model tracks them as *statuses*. The redundant
   transitions were removed so the worktree survives a suspension and is resumed
   in place.

Trace validation (`spec/TraceValidation.tla`) replays traces produced by the
**production `DagStore`** into the same `DagSystem` module, using its named
guards, so the validator has no private guard copy and the conformance check is
of production behavior.

## Implementation status

| Piece | Where | State |
|---|---|---|
| The composed machine | `spec/DagSystem.tla` | TLC-verified on the fixture (3,946 states; scheduler + worktree + file ownership, coupling invariants) |
| Safety for arbitrary N | `spec/DagSystemProof.tla` | TLAPS: `Init => Inv` and all 22 actions preserve all 10 components; `[]Inv` for every `Nodes`, `Edges`, `Files`, `MaxGen`, `MaxDropped` |
| Executable mirror + count cross-check | `src/formal/system-model.ts`, `test/system-model.spec.ts` | done; TS reaches TLC's exact count |
| Production machine | `src/engine/state.ts`, `src/engine/reducer.ts`, `src/extension/store.ts` | one durable store whose reducer IS `referenceReduceSystemState` |
| Git engine | `src/engine/git.ts` | done; probe, add, validate, ff-or-`--no-ff`, abort, resolve, remove, repair; tested against a real repo |
| Production trace validation | `scripts/emit-traces.ts`, `spec/TraceValidation.tla` | traces come from the real store and are TLC-validated |
| Dispatcher | `src/extension/dispatcher.ts` | done; concurrent spawns, serialized settlement, `PiSpawner` |
| Node↔dispatcher channel | `src/extension/dag-report.ts` | done; `dag_report` registered only in a node process; result file kept outside the worktree |
| Live end-to-end | nested `pi` against a temp repo | `run` → integrated, commit merged into `main`, worktree removed, node completed |

All items above are implemented:

- `underspecified` is a first-class status in the core `DagOrchestrator` model
  (TLC re-verified at **6,598 states**) *and* a worktree phase; `dag_report`
  outcome `underspecified` maps to it and `resume` returns the node to work.
- The conflict policy is selectable per node (`delegate | ours | theirs | halt`).
  `ours`/`theirs` resolve every conflicted file and commit the merge; `delegate`
  leaves the merge in progress and spawns a resolver agent, which the dispatcher
  then records with `finishMerge`.
- `dag_write` accepts `policy` and `noop`; `noop` relaxes the "at least one
  commit ahead" requirement for nodes that legitimately change nothing.
- Declared file ownership is exclusive across a declaration, so parallel nodes
  cannot claim the same file and silently overwrite each other at merge time.

Closable gaps closed after the first audit:

- **Recovery on load.** A restored snapshot's effects and in-progress merges are
  process-local and stale; the extension now runs the model's `Crash` + `Reopen`
  + `Reconcile` through `DagStore.recover()`, and the dispatcher re-admits a
  recovered node in place. A model stutter burns no revision.
- **File ownership is a modelled completion contract.** The spec has a
  `checked` flag (`GuardCheckFiles`, `CompletedFilesChecked`), and production
  refuses `complete` until `git diff base..HEAD` is inside the declared files.
- **Every git failure maps onto the alphabet.** `#gitFailed` converts an
  unexpected `GitError` (locked index, I/O failure) into `stop`, `merge-conflict`,
  or `fail`, so no raw I/O error escapes the verified alphabet.
- **A hung child is bounded.** `PiSpawner` kills after a timeout and reports
  `failed`, so the liveness properties' fairness assumption is enforced in
  practice rather than assumed.
- **Overlapping dispatches are refused** by an in-flight guard, so settlements
  cannot interleave.
- **Crash injection** covers a lost final append and an interrupted merge at the
  store level, and the board quarantines a corrupt artifact, reclaims a stale
  lock, and times out on a live one.

Still environment-bound, and named rather than hidden: the TLC run is on a
finite fixture (two nodes, `MaxGen=2`, `MaxDropped=4`), so **liveness** is
checked exhaustively only for that instance (safety is a theorem in N via
`DagSystemProof.tla`); git's full behavior space is mapped as outcomes, but only
the mapped alphabet is verified; the child process is not sandboxed to its
worktree; and the board's unforgeability is a code-path property, not
cryptographic. The resolver is judged by git state (no merge in progress, clean
tree), so a partial resolution counts as blocked.

## Decisions

1. **Integration shape: C — flat integration + declared base.**
   Every node branches from the current integration HEAD; every completed node
   merges into root. `deps` determine readiness and the recorded base, never a
   "parent" that xargs into root by accident.
2. **Merge strategy: fast-forward when the target has not moved, otherwise a
   merge commit (`--no-ff`). Never rebase.**
   FF applies exactly when `integration HEAD == node base` (the first merge, or a
   single chain). Otherwise root has moved and a merge commit is the truthful
   record. Rebase is rejected because it rewrites the completion commit that the
   durable two-phase record and `NoLostWork` depend on; merge commits keep SHAs
   stable and make `git log --graph` show the dependency structure, which is the
   history we want to read. Merge message: `dag: <node> (deps <a>,<b>)`.
3. **Conflict policy is per node**: `delegate | ours | theirs | halt`.
   `delegate` spawns a resolver node (brief = both sides' briefs + `git diff
   --name-only --diff-filter=U` + the two commits). `halt` blocks the node and
   preempts the dispatcher. Defaults: `halt` for task nodes, `delegate` for
   integration nodes. Partial merges are safe because merging is idempotent.
4. **Outcomes are distinct and first-class.**
   - `completed` — the work is finished and committed.
   - `blocked` — *the request is understood but cannot be fulfilled.* Suspends
     the node; the dispatcher must change something and `resume`, or leave it.
   - `underspecified` — *multiple interpretations, unclear which to carry out.*
     Suspends the node and preempts the dispatcher, who answers with an amended
     brief; the node then `resume`s **in place** (same worktree, same commits).
   Both are resumable; `underspecified` is distinguished for observability and
   routing.
5. **Continuous ready-node dispatch.**
   A node becomes ready when all of its deps are **integrated** (merged into
   root), not merely completed. Dispatch as soon as ready; merge each node into
   root as soon as it completes. Waves become a **derived display layer**
   (topological depth) and are no longer a scheduling barrier. Consequence:
   concurrent siblings may merge onto a moved root and therefore produce merge
   commits; that is expected and handled by the node's conflict policy.
6. **Worktrees**: `<repo-root>/.worktrees/<generation>/<sanitized-node>/` on
   branch `dsh/dag/<generation>/<sanitized-node>`. `.worktrees/` is gitignored;
   a node with a dirty root, a detached HEAD, or a tracked `.worktrees/` is
   refused before any git write.
7. **Automatic to completion.** No per-wave checkpoint. The dispatcher is
   preempted only for a `blocked`, `underspecified`, or (policy-permitting)
   conflicted node.
8. **No board coupling.** The DAG must not depend on the message board. It
   provides exactly one control channel, node ↔ dispatcher:
   - **node → dispatcher**: the structured outcome (state + summary +
     `completedCommit`), read by the dispatcher and used to settle the node;
   - **dispatcher → node**: an amended brief or a conflict-resolution
     instruction, delivered to the running node.
   The channel is a structured protocol (a control record), not general chat. If
   the board extension is active, the DAG **does not register a chat/messaging
   tool**; peer chat is left to the board, and node↔dispatcher control stays
   structured. If the board is absent, the DAG alone still performs its node↔
   dispatcher control, but it does not grow into a general message board.
   The board is **repository-scoped** (its file lives in the shared git common
   directory), so a node agent in its worktree and the dispatcher in the root
   resolve the same board — the documented peer channel works without the DAG
   knowing the board exists, and the clean-root check is unaffected because
   nothing is written into a working tree.

## Formalism change

The verified core (Node / Command / Effect) is kept. Three machines are added:

```
GitMachine (per node)   absent → created → completed → merging → integrated → removed
                                                      ↘ conflicted ↗
SchedulerMachine        ready = ∀ deps integrated; dispatch when ready
IntegrationMachine      root, per-node integrated flag, idempotent merge, conflict
```

New invariants, to be model-checked:

- `NoLostWork` — a node's worktree reaches `removed` only after its completion
  commit is `integrated`.
- `IntegratedMonotonic` — once integrated, always integrated.
- `DependentAfterDep` — a node's worktree exists only after every dep is
  integrated.
- `MergeTwoPhase` — a merge is `begin → commit` with a durable record between;
  a crash after the git merge but before the record permits only an idempotent
  re-merge, never a second integration.
- `OutcomeTerminal` — `completed` is terminal for the worktree; `blocked` and
  `underspecified` are suspended, resumable states.

Crash windows the model must admit and repair:

| Kill point | Required behavior |
|---|---|
| after `worktree add`, before recording | adopt the worktree; a repair transition for an unregistered path |
| after merge, before recording | retry re-merges idempotently (`integrated` already true ⇒ no-op) |
| after recording, before removal | removal resumes; worktree is not re-merged |
| after `completed`, before integration | dep is not integrated yet, so dependents stay undispatched; retry the merge |
| mid-`worktree add` | `reset`-style repair, as in the dag note's stranded-id case |

## Implementation plan (order)

1. `spec/DagGit.tla` + TLC: the worktree/merge machine above, with `NoLostWork`,
   `IntegratedMonotonic`, `DependentAfterDep`, and the two-phase merge. This is
   the first commit — verify the design before writing git code.
2. `src/engine/git.ts`: probe (clean root / symbolic branch / valid HEAD),
   `worktree add`, completion validation (branch, clean tree, no merge in
   progress, deps ancestors, ≥1 commit ahead unless `no-op`), `merge --ff-only`
   or `--no-ff`, `worktree remove`/`prune`, and the repair path. Unit-tested
   against a real temp repository.
3. Extend the durable DAG state with the git facts and the two-phase records;
   wire `write`/`amend` to accept `kind`, `no-op`, and the conflict policy.
4. Nested-`pi` spawner with `cwd` = worktree and the control channel; the
   dispatcher settles outcomes and preempts on `blocked`/`underspecified`.
5. Only then: the dispatcher-facing UX (status shows derived waves, worktrees,
   and pending merges).
