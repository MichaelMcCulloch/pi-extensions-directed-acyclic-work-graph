------------------------------ MODULE DagGit ------------------------------
\* Worktree and integration lifecycle for the DAG, with the crash windows that
\* matter. This is the layer the main DagOrchestrator model abstracts away.
\*
\* Per node:
\*   absent -> created -> completed -> integrated -> removed
\*                               \-> conflicted -> completed (resolved)
\*                    \-> blocked / underspecified -> created (resumed)
\*
\* The merge is two-phase: BeginMerge records an in-progress merge, CommitMerge
\* records that the completion commit is integrated. A Crash may clear an
\* in-progress merge; retrying is safe because merging an already-merged commit
\* is a no-op. `NoLostWork` is the property the design exists to protect: a
\* worktree is removed only after its commit is integrated.
\*
\* Sync with src/formal/git-model.ts and src/engine/git.ts.
\* --------------------------------------------------------------------------

EXTENDS Naturals, FiniteSets, TLC

Nodes == {"n1", "n2", "n3"}
Edges == {<<"n1", "n2">>, <<"n1", "n3">>}
Deps(n) == {m \in Nodes : <<m, n>> \in Edges}

GState == {"absent", "created", "completed", "integrated", "conflicted",
           "blocked", "underspecified", "removed"}

VARIABLES gstate, committed, integrated, registered, merging

vars == <<gstate, committed, integrated, registered, merging>>

TypeOK ==
    /\ gstate \in [Nodes -> GState]
    /\ committed \in [Nodes -> BOOLEAN]
    /\ integrated \in [Nodes -> BOOLEAN]
    /\ registered \in [Nodes -> BOOLEAN]
    /\ merging \in [Nodes -> BOOLEAN]

Init ==
    /\ gstate = [n \in Nodes |-> "absent"]
    /\ committed = [n \in Nodes |-> FALSE]
    /\ integrated = [n \in Nodes |-> FALSE]
    /\ registered = [n \in Nodes |-> FALSE]
    /\ merging = [n \in Nodes |-> FALSE]

CanCreate(n) ==
    /\ gstate[n] = "absent"
    /\ \A d \in Deps(n): integrated[d]

Create(n) ==
    /\ CanCreate(n)
    /\ gstate' = [gstate EXCEPT ![n] = "created"]
    /\ committed' = [committed EXCEPT ![n] = FALSE]
    /\ registered' = [registered EXCEPT ![n] = FALSE]
    /\ UNCHANGED <<integrated, merging>>

\* Completing the worktree add. A crash between Create and this step leaves the
\* intent durable and the registration incomplete; running it again is the
\* repair.
FinishWorktree(n) ==
    /\ gstate[n] = "created"
    /\ ~registered[n]
    /\ registered' = [registered EXCEPT ![n] = TRUE]
    /\ UNCHANGED <<gstate, committed, integrated, merging>>

\* The child finished and the dispatcher validated the completion.
ChildComplete(n) ==
    /\ gstate[n] = "created"
    /\ registered[n]
    /\ gstate' = [gstate EXCEPT ![n] = "completed"]
    /\ committed' = [committed EXCEPT ![n] = TRUE]
    /\ UNCHANGED <<integrated, registered, merging>>

SuspendBlocked(n) ==
    /\ gstate[n] = "created"
    /\ gstate' = [gstate EXCEPT ![n] = "blocked"]
    /\ UNCHANGED <<committed, integrated, registered, merging>>

SuspendUnderspecified(n) ==
    /\ gstate[n] = "created"
    /\ gstate' = [gstate EXCEPT ![n] = "underspecified"]
    /\ UNCHANGED <<committed, integrated, registered, merging>>

ResumeNode(n) ==
    /\ gstate[n] \in {"blocked", "underspecified"}
    /\ gstate' = [gstate EXCEPT ![n] = "created"]
    /\ UNCHANGED <<committed, integrated, registered, merging>>

BeginMerge(n) ==
    /\ gstate[n] = "completed"
    /\ committed[n]
    /\ ~integrated[n]
    /\ ~merging[n]
    /\ merging' = [merging EXCEPT ![n] = TRUE]
    /\ UNCHANGED <<gstate, committed, integrated, registered>>

CommitMerge(n) ==
    /\ gstate[n] = "completed"
    /\ merging[n]
    /\ integrated' = [integrated EXCEPT ![n] = TRUE]
    /\ merging' = [merging EXCEPT ![n] = FALSE]
    /\ gstate' = [gstate EXCEPT ![n] = "integrated"]
    /\ UNCHANGED <<committed, registered>>

MergeConflict(n) ==
    /\ gstate[n] = "completed"
    /\ merging[n]
    /\ gstate' = [gstate EXCEPT ![n] = "conflicted"]
    /\ merging' = [merging EXCEPT ![n] = FALSE]
    /\ UNCHANGED <<committed, integrated, registered>>

ResolveConflict(n) ==
    /\ gstate[n] = "conflicted"
    /\ gstate' = [gstate EXCEPT ![n] = "completed"]
    /\ committed' = [committed EXCEPT ![n] = TRUE]
    /\ UNCHANGED <<integrated, registered, merging>>

\* Removal is allowed only after integration.
Remove(n) ==
    /\ gstate[n] = "integrated"
    /\ integrated[n]
    /\ gstate' = [gstate EXCEPT ![n] = "removed"]
    /\ UNCHANGED <<committed, integrated, registered, merging>>

\* Process death clears in-progress merges; durable records survive.
Crash ==
    /\ merging' = [n \in Nodes |-> FALSE]
    /\ UNCHANGED <<gstate, committed, integrated, registered>>

MergeStep(n) == BeginMerge(n) \/ CommitMerge(n) \/ MergeConflict(n)

\* A crash can interrupt an in-progress merge, but it must not be able to starve
\* the commit forever: if the merge is ready infinitely often, it settles.
SettleStep(n) == CommitMerge(n) \/ MergeConflict(n)

Next ==
    \/ \E n \in Nodes: Create(n)
    \/ \E n \in Nodes: FinishWorktree(n)
    \/ \E n \in Nodes: ChildComplete(n)
    \/ \E n \in Nodes: SuspendBlocked(n)
    \/ \E n \in Nodes: SuspendUnderspecified(n)
    \/ \E n \in Nodes: ResumeNode(n)
    \/ \E n \in Nodes: BeginMerge(n)
    \/ \E n \in Nodes: CommitMerge(n)
    \/ \E n \in Nodes: MergeConflict(n)
    \/ \E n \in Nodes: ResolveConflict(n)
    \/ \E n \in Nodes: Remove(n)
    \/ Crash

Inv ==
    /\ TypeOK
    /\ \A n \in Nodes:
         /\ (gstate[n] = "removed" => integrated[n])
         /\ (gstate[n] # "absent" => \A d \in Deps(n): integrated[d])
         /\ (integrated[n] => gstate[n] \in {"integrated", "removed"})
         /\ (gstate[n] \in {"completed", "integrated", "conflicted", "removed"} => registered[n])
         /\ (integrated[n] => committed[n])
         /\ (gstate[n] = "conflicted" => committed[n])
         /\ (merging[n] => gstate[n] = "completed")

IntegratedMonotonic ==
    \A n \in Nodes: [] (integrated[n] => [] (integrated[n]))

WorktreeEventuallyReady ==
    \A n \in Nodes: [] (gstate[n] = "created" => <> (registered[n] \/ gstate[n] # "created"))

IntegrationSettles ==
    \A n \in Nodes: [] (gstate[n] = "completed" => <> (gstate[n] \in {"integrated", "conflicted"}))

Spec ==
    /\ Init
    /\ [][Next]_vars
    /\ \A n \in Nodes: WF_vars(FinishWorktree(n))
    /\ \A n \in Nodes: WF_vars(BeginMerge(n))
    /\ \A n \in Nodes: SF_vars(SettleStep(n))

=============================================================================
