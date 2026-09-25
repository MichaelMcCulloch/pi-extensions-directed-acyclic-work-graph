---------------------------- MODULE DagOrchestrator ----------------------------
\* A formally verified model of the DAG orchestrator.
\*
\* The model is the synchronous product of four state machines, each owning a
\* disjoint slice of the state:
\*
\*   GraphMachine    declared         which nodes the declaration contains
\*   NodeMachine     status, gen      node lifecycle and its monotonic fence
\*   CommandMachine  cmd              the durable accepted command per node
\*   EffectMachine   effect, fence    the process-local effect per node
\*
\* The interesting behavior is in the coupling. The two races that the shipped
\* engine must survive are modeled explicitly:
\*
\*   1. A stop or steer invalidates a running effect by bumping gen while the
\*      effect is still physically running. When that effect returns it must be
\*      dropped rather than applied (StaleEffect).
\*   2. A crash (Reopen) loses every process-local effect while leaving the
\*      durable status, generation, and accepted command intact; Reconcile then
\*      re-arms the node from durable state.
\*
\* TLC proves that Inv holds in every reachable state and that the three
\* temporal properties hold for every fair behavior. `test/model.spec.ts`
\* exhaustively explores this same transition relation in TypeScript, and
\* `spec/TraceValidation.tla` checks that real engine traces are behaviors of
\* this machine.
\*
\* Sync any change here with src/formal/model.ts. The two are kept honest by
\* test/spec-parity.spec.ts, which compares the action vocabulary.
\* ----------------------------------------------------------------------------

EXTENDS Naturals, TLC

CONSTANTS
    MaxGen,       \* bound on the per-node generation
    MaxDropped    \* bound on dropped stale effects

\* The verification target: a three-node chain. Change this module (and the
\* matching bounds in the .cfg) to check another bounded topology.
Nodes == {"n1", "n2", "n3"}
Edges == {<<"n1", "n2">>, <<"n2", "n3">>}

Deps(n) == {m \in Nodes : <<m, n>> \in Edges}

Status == {"pending", "starting", "in_progress", "completed",
           "blocked", "failed", "interrupted", "underspecified"}
CmdState == {"none", "accepted"}
EffectState == {"idle", "running"}

VARIABLES
    declared,      \* [Nodes -> BOOLEAN]
    status,        \* [Nodes -> Status]
    gen,           \* [Nodes -> 0..MaxGen]
    cmd,           \* [Nodes -> CmdState]
    effect,        \* [Nodes -> EffectState]   (process-local)
    effectFence,   \* [Nodes -> 0..MaxGen]
    completedGen,  \* [Nodes -> 0..MaxGen]
    dropped        \* 0..MaxDropped

vars == <<declared, status, gen, cmd, effect, effectFence, completedGen, dropped>>

TypeOK ==
    /\ declared \in [Nodes -> BOOLEAN]
    /\ status \in [Nodes -> Status]
    /\ gen \in [Nodes -> 0..MaxGen]
    /\ cmd \in [Nodes -> CmdState]
    /\ effect \in [Nodes -> EffectState]
    /\ effectFence \in [Nodes -> 0..MaxGen]
    /\ completedGen \in [Nodes -> 0..MaxGen]
    /\ dropped \in 0..MaxDropped

AllDepsCompleted(n) == \A d \in Deps(n): status[d] = "completed"
AllDepsDeclared(n) == \A d \in Deps(n): declared[d]

Init ==
    /\ declared = [n \in Nodes |-> FALSE]
    /\ status = [n \in Nodes |-> "pending"]
    /\ gen = [n \in Nodes |-> 0]
    /\ cmd = [n \in Nodes |-> "none"]
    /\ effect = [n \in Nodes |-> "idle"]
    /\ effectFence = [n \in Nodes |-> 0]
    /\ completedGen = [n \in Nodes |-> 0]
    /\ dropped = 0

\* ---------------------------------------------------------------------------
\* Guards. Each is a state predicate; the trace validator reuses them so that
\* "the action is enabled" has exactly one definition.
\* ---------------------------------------------------------------------------

GuardDeclare(n) ==
    /\ ~declared[n]
    /\ AllDepsDeclared(n)

GuardDispatch(n) ==
    /\ declared[n]
    /\ status[n] = "pending"
    /\ cmd[n] = "none"
    /\ effect[n] = "idle"
    /\ gen[n] < MaxGen
    /\ AllDepsCompleted(n)

GuardRedispatch(n) ==
    /\ status[n] = "failed"
    /\ cmd[n] = "none"
    /\ effect[n] = "idle"
    /\ gen[n] < MaxGen

GuardResume(n) ==
    /\ status[n] \in {"blocked", "interrupted", "failed", "underspecified"}
    /\ cmd[n] = "none"
    /\ effect[n] = "idle"
    /\ gen[n] < MaxGen

GuardSteer(n) ==
    /\ status[n] \in {"in_progress", "blocked", "interrupted", "failed", "underspecified"}
    /\ gen[n] < MaxGen

GuardStop(n) ==
    /\ (status[n] \in {"starting", "in_progress"} \/ cmd[n] = "accepted")
    /\ gen[n] < MaxGen

GuardAdmit(n) ==
    /\ cmd[n] = "accepted"
    /\ effect[n] = "idle"

GuardComplete(n) ==
    /\ effect[n] = "running"
    /\ effectFence[n] = gen[n]
    /\ status[n] = "in_progress"

GuardBlock(n) ==
    /\ effect[n] = "running"
    /\ effectFence[n] = gen[n]
    /\ status[n] = "in_progress"

GuardFail(n) ==
    /\ effect[n] = "running"
    /\ effectFence[n] = gen[n]
    /\ status[n] = "in_progress"

GuardUnderspecify(n) ==
    /\ effect[n] = "running"
    /\ effectFence[n] = gen[n]
    /\ status[n] = "in_progress"

GuardStale(n) ==
    /\ effect[n] = "running"
    /\ effectFence[n] < gen[n]
    /\ dropped < MaxDropped

GuardReconcile(n) ==
    /\ status[n] = "in_progress"
    /\ effect[n] = "idle"
    /\ gen[n] < MaxGen

GuardReopen == TRUE

\* ---------------------------------------------------------------------------
\* Actions. Each names the machine it primarily advances; coupled actions write
\* more than one machine's variables.
\* ---------------------------------------------------------------------------

Declare(n) ==                                       \* GraphMachine
    /\ GuardDeclare(n)
    /\ declared' = [declared EXCEPT ![n] = TRUE]
    /\ UNCHANGED <<status, gen, cmd, effect, effectFence, completedGen, dropped>>

Dispatch(n) ==                                      \* NodeMachine + CommandMachine
    /\ GuardDispatch(n)
    /\ status' = [status EXCEPT ![n] = "starting"]
    /\ gen' = [gen EXCEPT ![n] = gen[n] + 1]
    /\ cmd' = [cmd EXCEPT ![n] = "accepted"]
    /\ UNCHANGED <<declared, effect, effectFence, completedGen, dropped>>

Redispatch(n) ==                                    \* NodeMachine
    /\ GuardRedispatch(n)
    /\ status' = [status EXCEPT ![n] = "pending"]
    /\ gen' = [gen EXCEPT ![n] = gen[n] + 1]
    /\ UNCHANGED <<declared, cmd, effect, effectFence, completedGen, dropped>>

Resume(n) ==                                        \* NodeMachine + CommandMachine
    /\ GuardResume(n)
    /\ status' = [status EXCEPT ![n] = "starting"]
    /\ gen' = [gen EXCEPT ![n] = gen[n] + 1]
    /\ cmd' = [cmd EXCEPT ![n] = "accepted"]
    /\ UNCHANGED <<declared, effect, effectFence, completedGen, dropped>>

Steer(n) ==                                         \* NodeMachine + CommandMachine
    /\ GuardSteer(n)
    /\ status' = [status EXCEPT ![n] = "starting"]
    /\ gen' = [gen EXCEPT ![n] = gen[n] + 1]
    /\ cmd' = [cmd EXCEPT ![n] = "accepted"]
    /\ UNCHANGED <<declared, effect, effectFence, completedGen, dropped>>

Stop(n) ==                                          \* NodeMachine + CommandMachine
    /\ GuardStop(n)
    /\ status' = [status EXCEPT ![n] = "interrupted"]
    /\ gen' = [gen EXCEPT ![n] = gen[n] + 1]
    /\ cmd' = [cmd EXCEPT ![n] = "none"]
    /\ UNCHANGED <<declared, effect, effectFence, completedGen, dropped>>

Admit(n) ==                                         \* CommandMachine + EffectMachine
    /\ GuardAdmit(n)
    /\ status' = [status EXCEPT ![n] = "in_progress"]
    /\ cmd' = [cmd EXCEPT ![n] = "none"]
    /\ effect' = [effect EXCEPT ![n] = "running"]
    /\ effectFence' = [effectFence EXCEPT ![n] = gen[n]]
    /\ UNCHANGED <<declared, gen, completedGen, dropped>>

Complete(n) ==                                      \* EffectMachine + NodeMachine
    /\ GuardComplete(n)
    /\ status' = [status EXCEPT ![n] = "completed"]
    /\ completedGen' = [completedGen EXCEPT ![n] = gen[n]]
    /\ effect' = [effect EXCEPT ![n] = "idle"]
    /\ UNCHANGED <<declared, gen, cmd, effectFence, dropped>>

Block(n) ==                                         \* EffectMachine + NodeMachine
    /\ GuardBlock(n)
    /\ status' = [status EXCEPT ![n] = "blocked"]
    /\ effect' = [effect EXCEPT ![n] = "idle"]
    /\ UNCHANGED <<declared, gen, cmd, effectFence, completedGen, dropped>>

Fail(n) ==                                          \* EffectMachine + NodeMachine
    /\ GuardFail(n)
    /\ status' = [status EXCEPT ![n] = "failed"]
    /\ effect' = [effect EXCEPT ![n] = "idle"]
    /\ UNCHANGED <<declared, gen, cmd, effectFence, completedGen, dropped>>

Underspecify(n) ==                                  \* EffectMachine + NodeMachine
    /\ GuardUnderspecify(n)
    /\ status' = [status EXCEPT ![n] = "underspecified"]
    /\ effect' = [effect EXCEPT ![n] = "idle"]
    /\ UNCHANGED <<declared, gen, cmd, effectFence, completedGen, dropped>>

StaleEffect(n) ==                                   \* EffectMachine
    /\ GuardStale(n)
    /\ effect' = [effect EXCEPT ![n] = "idle"]
    /\ dropped' = dropped + 1
    /\ UNCHANGED <<declared, status, gen, cmd, effectFence, completedGen>>

Reconcile(n) ==                                     \* Recovery
    /\ GuardReconcile(n)
    /\ status' = [status EXCEPT ![n] = "starting"]
    /\ gen' = [gen EXCEPT ![n] = gen[n] + 1]
    /\ cmd' = [cmd EXCEPT ![n] = "accepted"]
    /\ UNCHANGED <<declared, effect, effectFence, completedGen, dropped>>

Reopen ==                                           \* Recovery: process death
    /\ GuardReopen
    /\ effect' = [n \in Nodes |-> "idle"]
    /\ UNCHANGED <<declared, status, gen, cmd, effectFence, completedGen, dropped>>

Next ==
    \/ \E n \in Nodes: Declare(n)
    \/ \E n \in Nodes: Dispatch(n)
    \/ \E n \in Nodes: Redispatch(n)
    \/ \E n \in Nodes: Resume(n)
    \/ \E n \in Nodes: Steer(n)
    \/ \E n \in Nodes: Stop(n)
    \/ \E n \in Nodes: Admit(n)
    \/ \E n \in Nodes: Complete(n)
    \/ \E n \in Nodes: Block(n)
    \/ \E n \in Nodes: Fail(n)
    \/ \E n \in Nodes: Underspecify(n)
    \/ \E n \in Nodes: StaleEffect(n)
    \/ \E n \in Nodes: Reconcile(n)
    \/ Reopen

\* ---------------------------------------------------------------------------
\* Safety
\* ---------------------------------------------------------------------------

Inv ==
    /\ TypeOK
    /\ \A n \in Nodes:
         /\ (status[n] \in {"starting", "in_progress", "completed"}
             => AllDepsCompleted(n))
         /\ (declared[n] => AllDepsDeclared(n))
         /\ (cmd[n] = "accepted" => status[n] = "starting")
         /\ (effect[n] = "running"
             => status[n] \in {"in_progress", "starting", "interrupted"})
         /\ (effect[n] = "running" /\ effectFence[n] < gen[n]
             => status[n] \in {"starting", "interrupted"})
         /\ (status[n] = "completed"
             => /\ effect[n] = "idle"
                /\ cmd[n] = "none"
                /\ completedGen[n] = gen[n])
         /\ (status[n] \in {"blocked", "underspecified"}
             => /\ effect[n] = "idle"
                /\ cmd[n] = "none")
         /\ effectFence[n] <= gen[n]

\* ---------------------------------------------------------------------------
\* Liveness (under the fairness below)
\* ---------------------------------------------------------------------------

CompletedStable ==
    \A n \in Nodes: [](status[n] = "completed" => [](status[n] = "completed"))

EffectsTerminate ==
    \A n \in Nodes: [](effect[n] = "running" => <>(effect[n] = "idle"))

AcceptedAdmitted ==
    \A n \in Nodes: [](cmd[n] = "accepted" => <>(cmd[n] # "accepted"))

EffectReturns(n) ==
    \/ Complete(n)
    \/ Block(n)
    \/ Fail(n)
    \/ Underspecify(n)
    \/ StaleEffect(n)

Spec ==
    /\ Init
    /\ [][Next]_vars
    /\ \A n \in Nodes: WF_vars(Admit(n))
    /\ \A n \in Nodes: WF_vars(EffectReturns(n))
    /\ \A n \in Nodes: WF_vars(Reconcile(n))

=============================================================================
