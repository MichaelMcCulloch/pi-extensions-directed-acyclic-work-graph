----------------------------- MODULE DagSystem -----------------------------
\* The single verification subject: the whole DAG tool as one product of the
\* scheduler machine and the worktree/integration machine, plus declared file
\* ownership.
\*
\* This replaces the retired half-models (`spec/archive/DagOrchestrator.tla`,
\* `spec/archive/DagGit.tla`). Modelling the product directly removes the
\* refinement obligation between three models and lets the seams themselves be
\* invariants:
\*
\*   - a node is dispatched only when every dependency is integrated;
\*   - a dispatched node always has a live worktree, and a running node a
\*     registered one;
\*   - completed implies a commit, integrated implies completed, removed implies
\*     integrated (`NoLostWork`);
\*   - declared file ownership is pairwise disjoint.
\*
\* Bounds are small (two nodes, one edge, two files); the product is the point.
\* -------------------------------------------------------------------------

EXTENDS Naturals, FiniteSets, TLC

\* Parameterized so the inductive proof is a theorem for every node set,
\* dependency relation, file universe, and bound -- not only a fixture.
CONSTANTS Nodes, Edges, Files, MaxGen, MaxDropped

Deps(n) == {m \in Nodes : <<m, n>> \in Edges}

Status == {"pending", "starting", "in_progress", "completed", "blocked",
           "failed", "interrupted", "underspecified", "parked", "stale"}
GState == {"absent", "created", "completed", "integrated", "conflicted", "removed"}

VARIABLES
    declared, files, orphaned,
    status, gen, cmd, effect, effectFence, completedGen, dropped,
    gstate, committed, integrated, registered, merging, checked

vars == <<declared, files, orphaned, status, gen, cmd, effect, effectFence,
          completedGen, dropped, gstate, committed, integrated, registered,
          merging, checked>>

TypeOK ==
    /\ declared \in [Nodes -> BOOLEAN]
    /\ files \in [Nodes -> SUBSET Files]
    /\ orphaned \in [Nodes -> BOOLEAN]
    /\ status \in [Nodes -> Status]
    /\ gen \in [Nodes -> 0..MaxGen]
    /\ cmd \in [Nodes -> {"none", "accepted"}]
    /\ effect \in [Nodes -> {"idle", "running"}]
    /\ effectFence \in [Nodes -> 0..MaxGen]
    /\ completedGen \in [Nodes -> 0..MaxGen]
    /\ dropped \in 0..MaxDropped
    /\ gstate \in [Nodes -> GState]
    /\ committed \in [Nodes -> BOOLEAN]
    /\ integrated \in [Nodes -> BOOLEAN]
    /\ registered \in [Nodes -> BOOLEAN]
    /\ merging \in [Nodes -> BOOLEAN]
    /\ checked \in [Nodes -> BOOLEAN]

Init ==
    /\ declared = [n \in Nodes |-> FALSE]
    /\ files = [n \in Nodes |-> {}]
    /\ orphaned = [n \in Nodes |-> FALSE]
    /\ status = [n \in Nodes |-> "pending"]
    /\ gen = [n \in Nodes |-> 0]
    /\ cmd = [n \in Nodes |-> "none"]
    /\ effect = [n \in Nodes |-> "idle"]
    /\ effectFence = [n \in Nodes |-> 0]
    /\ completedGen = [n \in Nodes |-> 0]
    /\ dropped = 0
    /\ gstate = [n \in Nodes |-> "absent"]
    /\ committed = [n \in Nodes |-> FALSE]
    /\ integrated = [n \in Nodes |-> FALSE]
    /\ registered = [n \in Nodes |-> FALSE]
    /\ merging = [n \in Nodes |-> FALSE]
    /\ checked = [n \in Nodes |-> FALSE]

\* ---------------------------------------------------------------------------
\* Guards: one named definition each, shared by the actions and the validator
\* ---------------------------------------------------------------------------

GuardDeclare(n, f) ==
    /\ ~declared[n]
    /\ \A m \in Nodes: declared[m] => files[m] \cap f = {}

GuardAdopt(n, f) ==
    /\ declared[n]
    /\ orphaned[n]
    /\ \A m \in Nodes: (declared[m] /\ ~orphaned[m]) => files[m] \cap f = {}

GuardOrphan(n) ==
    /\ declared[n]
    /\ ~orphaned[n]
    /\ effect[n] = "idle"
    /\ ~merging[n]

GuardAmend(n) ==
    /\ declared[n]
    /\ ~orphaned[n]
    /\ cmd[n] = "none"
    /\ effect[n] = "idle"
    /\ ~merging[n]
    /\ ~integrated[n]

GuardMarkStale(n) ==
    /\ declared[n]
    /\ ~orphaned[n]
    /\ cmd[n] = "none"
    /\ effect[n] = "idle"
    /\ ~merging[n]
    /\ ~integrated[n]
    /\ status[n] \in {"completed", "blocked", "interrupted", "failed", "underspecified"}

GuardReset(n) ==
    status[n] = "stale"

GuardPark(n) ==
    /\ declared[n]
    /\ ~orphaned[n]
    /\ status[n] = "pending"

GuardUnpark(n) ==
    status[n] = "parked"

CanDispatch(n) ==
    /\ declared[n]
    /\ ~orphaned[n]
    /\ status[n] = "pending"
    /\ cmd[n] = "none"
    /\ effect[n] = "idle"
    /\ gen[n] < MaxGen
    /\ gstate[n] = "absent"
    /\ \A d \in Deps(n): integrated[d]

GuardFinish(n) ==
    /\ gstate[n] = "created"
    /\ ~registered[n]

GuardAdmit(n) ==
    /\ cmd[n] = "accepted"
    /\ effect[n] = "idle"
    /\ gstate[n] = "created"
    /\ registered[n]

CanSettle(n) ==
    /\ effect[n] = "running"
    /\ effectFence[n] = gen[n]
    /\ status[n] = "in_progress"

GuardStale(n) ==
    /\ effect[n] = "running"
    /\ effectFence[n] < gen[n]
    /\ dropped < MaxDropped

GuardResume(n) ==
    /\ status[n] \in {"blocked", "interrupted", "failed", "underspecified"}
    /\ cmd[n] = "none"
    /\ effect[n] = "idle"
    /\ gen[n] < MaxGen
    /\ gstate[n] = "created"

GuardSteer(n) ==
    /\ status[n] \in {"in_progress", "blocked", "interrupted", "failed", "underspecified"}
    /\ gen[n] < MaxGen

GuardStop(n) ==
    /\ (status[n] \in {"starting", "in_progress"} \/ cmd[n] = "accepted")
    /\ gen[n] < MaxGen

GuardBegin(n) ==
    /\ status[n] = "completed"
    /\ committed[n]
    /\ ~integrated[n]
    /\ ~merging[n]

GuardCommit(n) ==
    /\ status[n] = "completed"
    /\ merging[n]

GuardConflict(n) ==
    /\ status[n] = "completed"
    /\ merging[n]

GuardResolve(n) ==
    gstate[n] = "conflicted"

GuardRemove(n) ==
    /\ gstate[n] = "integrated"
    /\ integrated[n]

GuardCheckFiles(n) ==
    /\ CanSettle(n)
    /\ ~checked[n]

GuardReconcile(n) ==
    /\ status[n] = "in_progress"
    /\ effect[n] = "idle"
    /\ gen[n] < MaxGen

\* ---------------------------------------------------------------------------
\* Declaration and file ownership
\* ---------------------------------------------------------------------------

DeclareWith(n, f) ==
    /\ GuardDeclare(n, f)
    /\ files' = [files EXCEPT ![n] = f]
    /\ declared' = [declared EXCEPT ![n] = TRUE]
    /\ UNCHANGED <<orphaned, status, gen, cmd, effect, effectFence, completedGen, dropped,
                   gstate, committed, integrated, registered, merging, checked>>

Declare(n) ==
    \E f \in SUBSET Files: DeclareWith(n, f)

AdoptWith(n, f) ==
    /\ GuardAdopt(n, f)
    /\ files' = [files EXCEPT ![n] = f]
    /\ orphaned' = [orphaned EXCEPT ![n] = FALSE]
    /\ UNCHANGED <<declared, status, gen, cmd, effect, effectFence,
                   completedGen, dropped, gstate, committed, integrated,
                   registered, merging, checked>>

Adopt(n) ==
    \E f \in SUBSET Files: AdoptWith(n, f)

Orphan(n) ==
    /\ GuardOrphan(n)
    /\ orphaned' = [orphaned EXCEPT ![n] = TRUE]
    /\ files' = [files EXCEPT ![n] = {}]
    /\ UNCHANGED <<declared, status, gen, cmd, effect, effectFence,
                   completedGen, dropped, gstate, committed, integrated,
                   registered, merging, checked>>

AmendWith(n, f) ==
    /\ GuardAmend(n)
    /\ \A m \in Nodes: (m # n /\ declared[m] /\ ~orphaned[m]) => files[m] \cap f = {}
    /\ files' = [files EXCEPT ![n] = f]
    /\ status' = [status EXCEPT ![n] = IF status[n] \in {"pending", "parked"} THEN status[n] ELSE "stale"]
    /\ UNCHANGED <<declared, orphaned, gen, cmd, effect, effectFence,
                   completedGen, dropped, gstate, committed, integrated,
                   registered, merging, checked>>

Amend(n) ==
    \E f \in SUBSET Files: AmendWith(n, f)

MarkStale(n) ==
    /\ GuardMarkStale(n)
    /\ status' = [status EXCEPT ![n] = "stale"]
    /\ UNCHANGED <<declared, files, orphaned, gen, cmd, effect, effectFence,
                   completedGen, dropped, gstate, committed, integrated,
                   registered, merging, checked>>

Reset(n) ==
    /\ GuardReset(n)
    /\ status' = [status EXCEPT ![n] = "pending"]
    /\ cmd' = [cmd EXCEPT ![n] = "none"]
    /\ effect' = [effect EXCEPT ![n] = "idle"]
    /\ effectFence' = [effectFence EXCEPT ![n] = 0]
    /\ completedGen' = [completedGen EXCEPT ![n] = 0]
    /\ gstate' = [gstate EXCEPT ![n] = "absent"]
    /\ committed' = [committed EXCEPT ![n] = FALSE]
    /\ registered' = [registered EXCEPT ![n] = FALSE]
    /\ merging' = [merging EXCEPT ![n] = FALSE]
    /\ checked' = [checked EXCEPT ![n] = FALSE]
    /\ UNCHANGED <<declared, files, orphaned, gen, dropped, integrated>>

Park(n) ==
    /\ GuardPark(n)
    /\ status' = [status EXCEPT ![n] = "parked"]
    /\ UNCHANGED <<declared, files, orphaned, gen, cmd, effect, effectFence,
                   completedGen, dropped, gstate, committed, integrated,
                   registered, merging, checked>>

Unpark(n) ==
    /\ GuardUnpark(n)
    /\ status' = [status EXCEPT ![n] = "pending"]
    /\ UNCHANGED <<declared, files, orphaned, gen, cmd, effect, effectFence,
                   completedGen, dropped, gstate, committed, integrated,
                   registered, merging, checked>>

\* ---------------------------------------------------------------------------
\* Dispatch and worktree
\* ---------------------------------------------------------------------------

Dispatch(n) ==
    /\ CanDispatch(n)
    /\ status' = [status EXCEPT ![n] = "starting"]
    /\ gen' = [gen EXCEPT ![n] = gen[n] + 1]
    /\ cmd' = [cmd EXCEPT ![n] = "accepted"]
    /\ gstate' = [gstate EXCEPT ![n] = "created"]
    /\ registered' = [registered EXCEPT ![n] = FALSE]
    /\ UNCHANGED <<declared, files, orphaned, effect, effectFence, completedGen, dropped,
                   committed, integrated, merging, checked>>

FinishWorktree(n) ==
    /\ GuardFinish(n)
    /\ registered' = [registered EXCEPT ![n] = TRUE]
    /\ UNCHANGED <<declared, files, orphaned, status, gen, cmd, effect, effectFence,
                   completedGen, dropped, gstate, committed, integrated, merging, checked>>

Admit(n) ==
    /\ GuardAdmit(n)
    /\ status' = [status EXCEPT ![n] = "in_progress"]
    /\ cmd' = [cmd EXCEPT ![n] = "none"]
    /\ effect' = [effect EXCEPT ![n] = "running"]
    /\ effectFence' = [effectFence EXCEPT ![n] = gen[n]]
    /\ UNCHANGED <<declared, files, orphaned, gen, completedGen, dropped, gstate,
                   committed, integrated, registered, merging, checked>>

\* ---------------------------------------------------------------------------
\* Effect outcomes
\* ---------------------------------------------------------------------------

CheckFiles(n) ==
    /\ GuardCheckFiles(n)
    /\ checked' = [checked EXCEPT ![n] = TRUE]
    /\ UNCHANGED <<declared, files, orphaned, status, gen, cmd, effect, effectFence,
                   completedGen, dropped, gstate, committed, integrated, registered, merging>>

Complete(n) ==
    /\ CanSettle(n)
    /\ checked[n]
    /\ status' = [status EXCEPT ![n] = "completed"]
    /\ completedGen' = [completedGen EXCEPT ![n] = gen[n]]
    /\ effect' = [effect EXCEPT ![n] = "idle"]
    /\ committed' = [committed EXCEPT ![n] = TRUE]
    /\ gstate' = [gstate EXCEPT ![n] = "completed"]
    /\ UNCHANGED <<declared, files, orphaned, gen, cmd, effectFence, dropped,
                   integrated, registered, merging, checked>>

Block(n) ==
    /\ CanSettle(n)
    /\ status' = [status EXCEPT ![n] = "blocked"]
    /\ effect' = [effect EXCEPT ![n] = "idle"]
    /\ UNCHANGED <<declared, files, orphaned, gen, cmd, effectFence, completedGen, dropped,
                   gstate, committed, integrated, registered, merging, checked>>

Underspecify(n) ==
    /\ CanSettle(n)
    /\ status' = [status EXCEPT ![n] = "underspecified"]
    /\ effect' = [effect EXCEPT ![n] = "idle"]
    /\ UNCHANGED <<declared, files, orphaned, gen, cmd, effectFence, completedGen, dropped,
                   gstate, committed, integrated, registered, merging, checked>>

Fail(n) ==
    /\ CanSettle(n)
    /\ status' = [status EXCEPT ![n] = "failed"]
    /\ effect' = [effect EXCEPT ![n] = "idle"]
    /\ UNCHANGED <<declared, files, orphaned, gen, cmd, effectFence, completedGen, dropped,
                   gstate, committed, integrated, registered, merging, checked>>

EffectStale(n) ==
    /\ GuardStale(n)
    /\ effect' = [effect EXCEPT ![n] = "idle"]
    /\ dropped' = dropped + 1
    /\ UNCHANGED <<declared, files, orphaned, status, gen, cmd, effectFence, completedGen,
                   gstate, committed, integrated, registered, merging, checked>>

Resume(n) ==
    /\ GuardResume(n)
    /\ status' = [status EXCEPT ![n] = "starting"]
    /\ gen' = [gen EXCEPT ![n] = gen[n] + 1]
    /\ cmd' = [cmd EXCEPT ![n] = "accepted"]
    /\ UNCHANGED <<declared, files, orphaned, effect, effectFence, completedGen, dropped,
                   gstate, committed, integrated, registered, merging, checked>>

Steer(n) ==
    /\ GuardSteer(n)
    /\ status' = [status EXCEPT ![n] = "starting"]
    /\ gen' = [gen EXCEPT ![n] = gen[n] + 1]
    /\ cmd' = [cmd EXCEPT ![n] = "accepted"]
    /\ UNCHANGED <<declared, files, orphaned, effect, effectFence, completedGen, dropped,
                   gstate, committed, integrated, registered, merging, checked>>

Stop(n) ==
    /\ GuardStop(n)
    /\ status' = [status EXCEPT ![n] = "interrupted"]
    /\ gen' = [gen EXCEPT ![n] = gen[n] + 1]
    /\ cmd' = [cmd EXCEPT ![n] = "none"]
    /\ UNCHANGED <<declared, files, orphaned, effect, effectFence, completedGen, dropped,
                   gstate, committed, integrated, registered, merging, checked>>

\* ---------------------------------------------------------------------------
\* Integration: two-phase, idempotent, only from a completed node
\* ---------------------------------------------------------------------------

BeginMerge(n) ==
    /\ GuardBegin(n)
    /\ merging' = [merging EXCEPT ![n] = TRUE]
    /\ UNCHANGED <<declared, files, orphaned, status, gen, cmd, effect, effectFence,
                   completedGen, dropped, gstate, committed, integrated, registered, checked>>

CommitMerge(n) ==
    /\ GuardCommit(n)
    /\ integrated' = [integrated EXCEPT ![n] = TRUE]
    /\ merging' = [merging EXCEPT ![n] = FALSE]
    /\ gstate' = [gstate EXCEPT ![n] = "integrated"]
    /\ UNCHANGED <<declared, files, orphaned, status, gen, cmd, effect, effectFence,
                   completedGen, dropped, committed, registered, checked>>

MergeConflict(n) ==
    /\ GuardConflict(n)
    /\ gstate' = [gstate EXCEPT ![n] = "conflicted"]
    /\ merging' = [merging EXCEPT ![n] = FALSE]
    /\ UNCHANGED <<declared, files, orphaned, status, gen, cmd, effect, effectFence,
                   completedGen, dropped, committed, integrated, registered, checked>>

ResolveConflict(n) ==
    /\ GuardResolve(n)
    /\ gstate' = [gstate EXCEPT ![n] = "completed"]
    /\ committed' = [committed EXCEPT ![n] = TRUE]
    /\ UNCHANGED <<declared, files, orphaned, status, gen, cmd, effect, effectFence,
                   completedGen, dropped, integrated, registered, merging, checked>>

Remove(n) ==
    /\ GuardRemove(n)
    /\ gstate' = [gstate EXCEPT ![n] = "removed"]
    /\ UNCHANGED <<declared, files, orphaned, status, gen, cmd, effect, effectFence,
                   completedGen, dropped, committed, integrated, registered, merging, checked>>

Reconcile(n) ==
    /\ GuardReconcile(n)
    /\ status' = [status EXCEPT ![n] = "starting"]
    /\ gen' = [gen EXCEPT ![n] = gen[n] + 1]
    /\ cmd' = [cmd EXCEPT ![n] = "accepted"]
    /\ UNCHANGED <<declared, files, orphaned, effect, effectFence, completedGen, dropped,
                   gstate, committed, integrated, registered, merging, checked>>

Crash ==
    /\ merging' = [n \in Nodes |-> FALSE]
    /\ UNCHANGED <<declared, files, orphaned, status, gen, cmd, effect, effectFence,
                   completedGen, dropped, gstate, committed, integrated, registered, checked>>

Reopen ==
    /\ effect' = [n \in Nodes |-> "idle"]
    /\ UNCHANGED <<declared, files, orphaned, status, gen, cmd, effectFence, completedGen,
                   dropped, gstate, committed, integrated, registered, merging, checked>>

Next ==
    \/ \E n \in Nodes: Declare(n)
    \/ \E n \in Nodes: Adopt(n)
    \/ \E n \in Nodes: Orphan(n)
    \/ \E n \in Nodes: Amend(n)
    \/ \E n \in Nodes: MarkStale(n)
    \/ \E n \in Nodes: Reset(n)
    \/ \E n \in Nodes: Park(n)
    \/ \E n \in Nodes: Unpark(n)
    \/ \E n \in Nodes: Dispatch(n)
    \/ \E n \in Nodes: FinishWorktree(n)
    \/ \E n \in Nodes: Admit(n)
    \/ \E n \in Nodes: CheckFiles(n)
    \/ \E n \in Nodes: Complete(n)
    \/ \E n \in Nodes: Block(n)
    \/ \E n \in Nodes: Underspecify(n)
    \/ \E n \in Nodes: Fail(n)
    \/ \E n \in Nodes: EffectStale(n)
    \/ \E n \in Nodes: Resume(n)
    \/ \E n \in Nodes: Steer(n)
    \/ \E n \in Nodes: Stop(n)
    \/ \E n \in Nodes: BeginMerge(n)
    \/ \E n \in Nodes: CommitMerge(n)
    \/ \E n \in Nodes: MergeConflict(n)
    \/ \E n \in Nodes: ResolveConflict(n)
    \/ \E n \in Nodes: Remove(n)
    \/ \E n \in Nodes: Reconcile(n)
    \/ Crash
    \/ Reopen

\* ---------------------------------------------------------------------------
\* Safety: core, git, coupling, and file ownership, in one invariant
\* ---------------------------------------------------------------------------

CoreInv ==
    /\ \A n \in Nodes:
         /\ (status[n] \in {"starting", "in_progress", "completed"}
             => \A d \in Deps(n): status[d] = "completed")
         /\ (cmd[n] = "accepted" => status[n] = "starting")
         /\ (effect[n] = "running"
             => status[n] \in {"in_progress", "starting", "interrupted"})
         /\ (effect[n] = "running" /\ effectFence[n] < gen[n]
             => status[n] \in {"starting", "interrupted"})
         /\ (status[n] = "completed"
             => effect[n] = "idle" /\ cmd[n] = "none" /\ completedGen[n] = gen[n]
                /\ checked[n])
         /\ (status[n] \in {"blocked", "underspecified", "parked", "stale"}
             => effect[n] = "idle" /\ cmd[n] = "none")
         /\ effectFence[n] <= gen[n]

GitInv ==
    /\ \A n \in Nodes:
         /\ (gstate[n] = "removed" => integrated[n])
         /\ (integrated[n] => gstate[n] \in {"integrated", "removed"})
         /\ (integrated[n] => committed[n])
         /\ (gstate[n] = "conflicted" => committed[n])
         /\ (merging[n] => status[n] = "completed" /\ committed[n])

CouplingInv ==
    /\ \A n \in Nodes:
         /\ (status[n] \in {"starting", "in_progress"} => \A d \in Deps(n): integrated[d])
         /\ (status[n] \in {"starting", "in_progress"} => gstate[n] = "created")
         /\ (status[n] = "in_progress" => registered[n])
         /\ (status[n] = "completed" => committed[n] /\ registered[n])
         /\ (integrated[n] => status[n] = "completed")
         /\ (gstate[n] # "absent" => declared[n])

FileOwnership ==
    \A m \in Nodes: \A k \in Nodes: m # k => files[m] \cap files[k] = {}

\* ---------------------------------------------------------------------------
\* Strengthenings required for induction (true in every reachable state, but
\* not implied by the invariants above; discovered by the TLAPS proof).
\* ---------------------------------------------------------------------------

\* Only a declared node may hold files, so a fresh declaration is disjoint from
\* every other node's files. Without this, FileOwnership is not inductive.
UndeclaredFree ==
    \A n \in Nodes:
        /\ (orphaned[n] => declared[n])
        /\ ((~declared[n] \/ orphaned[n]) => files[n] = {})

\* A node that has left pending has already had every dependency integrated
\* (and integrated never decreases). Without this, the invariant is not
\* preserved when a suspended node is resumed, steered, stopped, or reconciled.
DepsIntegratedBeyondPending ==
    \A n \in Nodes: status[n] \notin {"pending", "parked"} => \A d \in Deps(n): integrated[d]

\* A node in a suspended state still owns its live worktree. Without this,
\* steering a suspended node back to "starting" can lose the worktree fact.
SuspendedHasWorktree ==
    \A n \in Nodes:
        status[n] \in {"blocked", "interrupted", "failed", "underspecified"}
            => gstate[n] = "created"

\* A node that has ever left pending was declared (declared never clears).
\* Needed when a finished node enters the merge phase: the new git state is
\* not "absent", so the node must be declared.
DispatchedDeclared ==
    \A n \in Nodes: status[n] # "pending" => declared[n]

\* A node being merged is not yet integrated (BeginMerge requires ~integrated
\* and commit/conflict both clear the merging flag). Needed so a conflict cannot
\* leave an integrated node in the "conflicted" state.
MergingExcludesIntegrated ==
    \A n \in Nodes: merging[n] => ~integrated[n]

Inv == TypeOK /\ CoreInv /\ GitInv /\ CouplingInv /\ FileOwnership
       /\ UndeclaredFree /\ DepsIntegratedBeyondPending /\ SuspendedHasWorktree
       /\ DispatchedDeclared /\ MergingExcludesIntegrated

\* ---------------------------------------------------------------------------
\* Liveness
\* ---------------------------------------------------------------------------

EffectReturns(n) == Complete(n) \/ Block(n) \/ Underspecify(n) \/ Fail(n) \/ EffectStale(n)
SettleStep(n) == CommitMerge(n) \/ MergeConflict(n)

CompletedStable ==
    \A n \in Nodes: [] (integrated[n] => [] integrated[n])

EffectsTerminate ==
    \A n \in Nodes: [] (effect[n] = "running" => <> (effect[n] = "idle"))

IntegrationSettles ==
    \A n \in Nodes: [] (status[n] = "completed" => <> (integrated[n] \/ gstate[n] = "conflicted" \/ status[n] = "stale"))

Spec ==
    /\ Init
    /\ [][Next]_vars
    /\ \A n \in Nodes: WF_vars(FinishWorktree(n))
    /\ \A n \in Nodes: WF_vars(EffectReturns(n))
    /\ \A n \in Nodes: WF_vars(BeginMerge(n))
    /\ \A n \in Nodes: SF_vars(SettleStep(n))

=============================================================================
