--------------------- MODULE TraceValidation ---------------------
\* Replay implementation traces against the single composed model.
\* `spec/generated/TracesData.tla` defines `Traces`; each step names an action
\* and the state the model should be in afterwards. The guards are the named
\* guards of DagSystem, so there is one definition of "enabled".
\* -----------------------------------------------------------------

EXTENDS DagSystem, TracesData, Naturals, Sequences, FiniteSets

VARIABLES traceNo, traceIndex, error

Trace == Traces[traceNo]

state ==
    [ declared |-> declared, files |-> files, status |-> status, gen |-> gen,
      cmd |-> cmd, effect |-> effect, effectFence |-> effectFence,
      completedGen |-> completedGen, dropped |-> dropped, gstate |-> gstate,
      committed |-> committed, integrated |-> integrated,
      registered |-> registered, merging |-> merging ]

machineVars == <<declared, files, status, gen, cmd, effect, effectFence,
                completedGen, dropped, gstate, committed, integrated,
                registered, merging>>

ActionOf(ev) ==
    \/ (ev.type = "declare"          /\ DeclareWith(ev.node, ev.files))
    \/ (ev.type = "dispatch"         /\ Dispatch(ev.node))
    \/ (ev.type = "finish-worktree"  /\ FinishWorktree(ev.node))
    \/ (ev.type = "admit"            /\ Admit(ev.node))
    \/ (ev.type = "complete"         /\ Complete(ev.node))
    \/ (ev.type = "block"            /\ Block(ev.node))
    \/ (ev.type = "underspecify"     /\ Underspecify(ev.node))
    \/ (ev.type = "fail"             /\ Fail(ev.node))
    \/ (ev.type = "effect-stale"     /\ EffectStale(ev.node))
    \/ (ev.type = "resume"           /\ Resume(ev.node))
    \/ (ev.type = "steer"            /\ Steer(ev.node))
    \/ (ev.type = "stop"             /\ Stop(ev.node))
    \/ (ev.type = "begin-merge"      /\ BeginMerge(ev.node))
    \/ (ev.type = "commit-merge"     /\ CommitMerge(ev.node))
    \/ (ev.type = "merge-conflict"   /\ MergeConflict(ev.node))
    \/ (ev.type = "resolve-conflict" /\ ResolveConflict(ev.node))
    \/ (ev.type = "remove"           /\ Remove(ev.node))
    \/ (ev.type = "reconcile"        /\ Reconcile(ev.node))
    \/ (ev.type = "crash"            /\ Crash)
    \/ (ev.type = "reopen"           /\ Reopen)

GuardOf(ev) ==
    \/ (ev.type = "declare"          /\ GuardDeclare(ev.node, ev.files))
    \/ (ev.type = "dispatch"         /\ CanDispatch(ev.node))
    \/ (ev.type = "finish-worktree"  /\ GuardFinish(ev.node))
    \/ (ev.type = "admit"            /\ GuardAdmit(ev.node))
    \/ (ev.type \in {"complete", "block", "underspecify", "fail"} /\ CanSettle(ev.node))
    \/ (ev.type = "effect-stale"     /\ GuardStale(ev.node))
    \/ (ev.type = "resume"           /\ GuardResume(ev.node))
    \/ (ev.type = "steer"            /\ GuardSteer(ev.node))
    \/ (ev.type = "stop"             /\ GuardStop(ev.node))
    \/ (ev.type = "begin-merge"      /\ GuardBegin(ev.node))
    \/ (ev.type = "commit-merge"     /\ GuardCommit(ev.node))
    \/ (ev.type = "merge-conflict"   /\ GuardConflict(ev.node))
    \/ (ev.type = "resolve-conflict" /\ GuardResolve(ev.node))
    \/ (ev.type = "remove"           /\ GuardRemove(ev.node))
    \/ (ev.type = "reconcile"        /\ GuardReconcile(ev.node))
    \/ (ev.type = "crash"            /\ TRUE)
    \/ (ev.type = "reopen"           /\ TRUE)

AssignState(s) ==
    /\ declared = s.declared
    /\ files = s.files
    /\ status = s.status
    /\ gen = s.gen
    /\ cmd = s.cmd
    /\ effect = s.effect
    /\ effectFence = s.effectFence
    /\ completedGen = s.completedGen
    /\ dropped = s.dropped
    /\ gstate = s.gstate
    /\ committed = s.committed
    /\ integrated = s.integrated
    /\ registered = s.registered
    /\ merging = s.merging

TraceInit ==
    /\ traceNo \in 1..Len(Traces)
    /\ traceIndex = 1
    /\ error = FALSE
    /\ AssignState(Trace[1].state)

TraceStep ==
    LET ev == Trace[traceIndex + 1].event IN
      \/ (GuardOf(ev) /\ ActionOf(ev) /\ UNCHANGED error)
      \/ (~GuardOf(ev) /\ UNCHANGED machineVars /\ error' = TRUE)

TraceNext ==
    \/ /\ traceIndex < Len(Trace)
       /\ TraceStep
       /\ traceIndex' = traceIndex + 1
       /\ UNCHANGED traceNo
    \/ /\ traceIndex = Len(Trace)
       /\ UNCHANGED <<machineVars, traceNo, traceIndex, error>>

TraceSpec ==
    TraceInit /\ [][TraceNext]_<<machineVars, traceNo, traceIndex, error>>

TraceInv ==
    /\ error = FALSE
    /\ (traceIndex > 0 => state = Trace[traceIndex].state)

=============================================================================
