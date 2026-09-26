------------------------ MODULE DagSystemProof ------------------------
\* The inductive safety proof for the parameterized DagSystem.
\*
\* Unlike the TLC fixture (two nodes, one edge, bounded generations), this
\* module proves `Spec => []Inv` for EVERY value of the constants. Each action
\* is proved to preserve each invariant component; no step appeals to
\* finiteness, so `[]Inv` holds for arbitrary N.
\*
\* Generated from the action/component list; keep in step with DagSystem.tla.
\* Run with tlapm (see scripts/tlapm.mjs and PROOF-NOTES.md).
\* ---------------------------------------------------------------------

EXTENDS DagSystem, TLAPS

\* `0..MaxGen` and `0..MaxDropped` are only well-founded for natural bounds;
\* the TLC fixture made this implicit by instantiating numerals.
THEOREM Safety ==
  ASSUME MaxGen \in Nat, MaxDropped \in Nat
  PROVE Spec => []Inv

  <1>1. Init => Inv
    <2>1. Init => TypeOK
      BY DEF Status, GState, Init, TypeOK, Deps
    <2>2. Init => CoreInv
      BY DEF Status, GState, Init, CoreInv, Deps
    <2>3. Init => GitInv
      BY DEF Status, GState, Init, GitInv, Deps
    <2>4. Init => CouplingInv
      BY DEF Status, GState, Init, CouplingInv, Deps
    <2>5. Init => FileOwnership
      BY DEF Status, GState, Init, FileOwnership, Deps
    <2>6. Init => UndeclaredFree
      BY DEF Status, GState, Init, UndeclaredFree, Deps
    <2>7. Init => DepsIntegratedBeyondPending
      BY DEF Status, GState, Init, DepsIntegratedBeyondPending, Deps
    <2>8. Init => SuspendedHasWorktree
      BY DEF Status, GState, Init, SuspendedHasWorktree, Deps
    <2>9. Init => DispatchedDeclared
      BY DEF Status, GState, Init, DispatchedDeclared, Deps
    <2>10. Init => MergingExcludesIntegrated
      BY DEF Status, GState, Init, MergingExcludesIntegrated, Deps
    <2>11. QED
      BY <2>1, <2>2, <2>3, <2>4, <2>5, <2>6, <2>7, <2>8, <2>9, <2>10 DEF Inv

  <1>2. Inv /\ [Next]_vars => Inv'
    <2>1. \A n \in Nodes: Inv /\ Declare(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ Declare(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Declare, DeclareWith, GuardDeclare, Deps
      <3>2. \A n \in Nodes: Inv /\ Declare(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Declare, DeclareWith, GuardDeclare, Deps
      <3>3. \A n \in Nodes: Inv /\ Declare(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Declare, DeclareWith, GuardDeclare, Deps
      <3>4. \A n \in Nodes: Inv /\ Declare(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Declare, DeclareWith, GuardDeclare, Deps
      <3>5. \A n \in Nodes: Inv /\ Declare(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Declare, DeclareWith, GuardDeclare, Deps
      <3>6. \A n \in Nodes: Inv /\ Declare(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Declare, DeclareWith, GuardDeclare, Deps
      <3>7. \A n \in Nodes: Inv /\ Declare(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Declare, DeclareWith, GuardDeclare, Deps
      <3>8. \A n \in Nodes: Inv /\ Declare(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Declare, DeclareWith, GuardDeclare, Deps
      <3>9. \A n \in Nodes: Inv /\ Declare(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Declare, DeclareWith, GuardDeclare, Deps
      <3>10. \A n \in Nodes: Inv /\ Declare(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Declare, DeclareWith, GuardDeclare, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>2. \A n \in Nodes: Inv /\ Adopt(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ Adopt(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Adopt, AdoptWith, GuardAdopt, Deps
      <3>2. \A n \in Nodes: Inv /\ Adopt(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Adopt, AdoptWith, GuardAdopt, Deps
      <3>3. \A n \in Nodes: Inv /\ Adopt(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Adopt, AdoptWith, GuardAdopt, Deps
      <3>4. \A n \in Nodes: Inv /\ Adopt(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Adopt, AdoptWith, GuardAdopt, Deps
      <3>5. \A n \in Nodes: Inv /\ Adopt(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Adopt, AdoptWith, GuardAdopt, Deps
      <3>6. \A n \in Nodes: Inv /\ Adopt(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Adopt, AdoptWith, GuardAdopt, Deps
      <3>7. \A n \in Nodes: Inv /\ Adopt(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Adopt, AdoptWith, GuardAdopt, Deps
      <3>8. \A n \in Nodes: Inv /\ Adopt(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Adopt, AdoptWith, GuardAdopt, Deps
      <3>9. \A n \in Nodes: Inv /\ Adopt(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Adopt, AdoptWith, GuardAdopt, Deps
      <3>10. \A n \in Nodes: Inv /\ Adopt(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Adopt, AdoptWith, GuardAdopt, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>3. \A n \in Nodes: Inv /\ Orphan(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ Orphan(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Orphan, GuardOrphan, Deps
      <3>2. \A n \in Nodes: Inv /\ Orphan(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Orphan, GuardOrphan, Deps
      <3>3. \A n \in Nodes: Inv /\ Orphan(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Orphan, GuardOrphan, Deps
      <3>4. \A n \in Nodes: Inv /\ Orphan(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Orphan, GuardOrphan, Deps
      <3>5. \A n \in Nodes: Inv /\ Orphan(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Orphan, GuardOrphan, Deps
      <3>6. \A n \in Nodes: Inv /\ Orphan(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Orphan, GuardOrphan, Deps
      <3>7. \A n \in Nodes: Inv /\ Orphan(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Orphan, GuardOrphan, Deps
      <3>8. \A n \in Nodes: Inv /\ Orphan(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Orphan, GuardOrphan, Deps
      <3>9. \A n \in Nodes: Inv /\ Orphan(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Orphan, GuardOrphan, Deps
      <3>10. \A n \in Nodes: Inv /\ Orphan(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Orphan, GuardOrphan, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>4. \A n \in Nodes: Inv /\ Amend(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ Amend(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Amend, AmendWith, GuardAmend, Deps
      <3>2. \A n \in Nodes: Inv /\ Amend(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Amend, AmendWith, GuardAmend, Deps
      <3>3. \A n \in Nodes: Inv /\ Amend(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Amend, AmendWith, GuardAmend, Deps
      <3>4. \A n \in Nodes: Inv /\ Amend(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Amend, AmendWith, GuardAmend, Deps
      <3>5. \A n \in Nodes: Inv /\ Amend(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Amend, AmendWith, GuardAmend, Deps
      <3>6. \A n \in Nodes: Inv /\ Amend(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Amend, AmendWith, GuardAmend, Deps
      <3>7. \A n \in Nodes: Inv /\ Amend(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Amend, AmendWith, GuardAmend, Deps
      <3>8. \A n \in Nodes: Inv /\ Amend(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Amend, AmendWith, GuardAmend, Deps
      <3>9. \A n \in Nodes: Inv /\ Amend(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Amend, AmendWith, GuardAmend, Deps
      <3>10. \A n \in Nodes: Inv /\ Amend(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Amend, AmendWith, GuardAmend, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>5. \A n \in Nodes: Inv /\ MarkStale(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ MarkStale(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, MarkStale, GuardMarkStale, Deps
      <3>2. \A n \in Nodes: Inv /\ MarkStale(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, MarkStale, GuardMarkStale, Deps
      <3>3. \A n \in Nodes: Inv /\ MarkStale(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, MarkStale, GuardMarkStale, Deps
      <3>4. \A n \in Nodes: Inv /\ MarkStale(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, MarkStale, GuardMarkStale, Deps
      <3>5. \A n \in Nodes: Inv /\ MarkStale(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, MarkStale, GuardMarkStale, Deps
      <3>6. \A n \in Nodes: Inv /\ MarkStale(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, MarkStale, GuardMarkStale, Deps
      <3>7. \A n \in Nodes: Inv /\ MarkStale(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, MarkStale, GuardMarkStale, Deps
      <3>8. \A n \in Nodes: Inv /\ MarkStale(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, MarkStale, GuardMarkStale, Deps
      <3>9. \A n \in Nodes: Inv /\ MarkStale(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, MarkStale, GuardMarkStale, Deps
      <3>10. \A n \in Nodes: Inv /\ MarkStale(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, MarkStale, GuardMarkStale, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>6. \A n \in Nodes: Inv /\ Reset(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ Reset(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Reset, GuardReset, Deps
      <3>2. \A n \in Nodes: Inv /\ Reset(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reset, GuardReset, Deps
      <3>3. \A n \in Nodes: Inv /\ Reset(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reset, GuardReset, Deps
      <3>4. \A n \in Nodes: Inv /\ Reset(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reset, GuardReset, Deps
      <3>5. \A n \in Nodes: Inv /\ Reset(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reset, GuardReset, Deps
      <3>6. \A n \in Nodes: Inv /\ Reset(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reset, GuardReset, Deps
      <3>7. \A n \in Nodes: Inv /\ Reset(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reset, GuardReset, Deps
      <3>8. \A n \in Nodes: Inv /\ Reset(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reset, GuardReset, Deps
      <3>9. \A n \in Nodes: Inv /\ Reset(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reset, GuardReset, Deps
      <3>10. \A n \in Nodes: Inv /\ Reset(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reset, GuardReset, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>7. \A n \in Nodes: Inv /\ Park(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ Park(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Park, GuardPark, Deps
      <3>2. \A n \in Nodes: Inv /\ Park(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Park, GuardPark, Deps
      <3>3. \A n \in Nodes: Inv /\ Park(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Park, GuardPark, Deps
      <3>4. \A n \in Nodes: Inv /\ Park(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Park, GuardPark, Deps
      <3>5. \A n \in Nodes: Inv /\ Park(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Park, GuardPark, Deps
      <3>6. \A n \in Nodes: Inv /\ Park(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Park, GuardPark, Deps
      <3>7. \A n \in Nodes: Inv /\ Park(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Park, GuardPark, Deps
      <3>8. \A n \in Nodes: Inv /\ Park(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Park, GuardPark, Deps
      <3>9. \A n \in Nodes: Inv /\ Park(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Park, GuardPark, Deps
      <3>10. \A n \in Nodes: Inv /\ Park(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Park, GuardPark, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>8. \A n \in Nodes: Inv /\ Unpark(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ Unpark(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Unpark, GuardUnpark, Deps
      <3>2. \A n \in Nodes: Inv /\ Unpark(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Unpark, GuardUnpark, Deps
      <3>3. \A n \in Nodes: Inv /\ Unpark(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Unpark, GuardUnpark, Deps
      <3>4. \A n \in Nodes: Inv /\ Unpark(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Unpark, GuardUnpark, Deps
      <3>5. \A n \in Nodes: Inv /\ Unpark(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Unpark, GuardUnpark, Deps
      <3>6. \A n \in Nodes: Inv /\ Unpark(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Unpark, GuardUnpark, Deps
      <3>7. \A n \in Nodes: Inv /\ Unpark(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Unpark, GuardUnpark, Deps
      <3>8. \A n \in Nodes: Inv /\ Unpark(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Unpark, GuardUnpark, Deps
      <3>9. \A n \in Nodes: Inv /\ Unpark(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Unpark, GuardUnpark, Deps
      <3>10. \A n \in Nodes: Inv /\ Unpark(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Unpark, GuardUnpark, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>9. \A n \in Nodes: Inv /\ Dispatch(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ Dispatch(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Dispatch, CanDispatch, Deps
      <3>2. \A n \in Nodes: Inv /\ Dispatch(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Dispatch, CanDispatch, Deps
      <3>3. \A n \in Nodes: Inv /\ Dispatch(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Dispatch, CanDispatch, Deps
      <3>4. \A n \in Nodes: Inv /\ Dispatch(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Dispatch, CanDispatch, Deps
      <3>5. \A n \in Nodes: Inv /\ Dispatch(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Dispatch, CanDispatch, Deps
      <3>6. \A n \in Nodes: Inv /\ Dispatch(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Dispatch, CanDispatch, Deps
      <3>7. \A n \in Nodes: Inv /\ Dispatch(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Dispatch, CanDispatch, Deps
      <3>8. \A n \in Nodes: Inv /\ Dispatch(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Dispatch, CanDispatch, Deps
      <3>9. \A n \in Nodes: Inv /\ Dispatch(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Dispatch, CanDispatch, Deps
      <3>10. \A n \in Nodes: Inv /\ Dispatch(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Dispatch, CanDispatch, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>10. \A n \in Nodes: Inv /\ FinishWorktree(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ FinishWorktree(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, FinishWorktree, GuardFinish, Deps
      <3>2. \A n \in Nodes: Inv /\ FinishWorktree(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, FinishWorktree, GuardFinish, Deps
      <3>3. \A n \in Nodes: Inv /\ FinishWorktree(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, FinishWorktree, GuardFinish, Deps
      <3>4. \A n \in Nodes: Inv /\ FinishWorktree(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, FinishWorktree, GuardFinish, Deps
      <3>5. \A n \in Nodes: Inv /\ FinishWorktree(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, FinishWorktree, GuardFinish, Deps
      <3>6. \A n \in Nodes: Inv /\ FinishWorktree(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, FinishWorktree, GuardFinish, Deps
      <3>7. \A n \in Nodes: Inv /\ FinishWorktree(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, FinishWorktree, GuardFinish, Deps
      <3>8. \A n \in Nodes: Inv /\ FinishWorktree(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, FinishWorktree, GuardFinish, Deps
      <3>9. \A n \in Nodes: Inv /\ FinishWorktree(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, FinishWorktree, GuardFinish, Deps
      <3>10. \A n \in Nodes: Inv /\ FinishWorktree(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, FinishWorktree, GuardFinish, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>11. \A n \in Nodes: Inv /\ Admit(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ Admit(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Admit, GuardAdmit, Deps
      <3>2. \A n \in Nodes: Inv /\ Admit(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Admit, GuardAdmit, Deps
      <3>3. \A n \in Nodes: Inv /\ Admit(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Admit, GuardAdmit, Deps
      <3>4. \A n \in Nodes: Inv /\ Admit(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Admit, GuardAdmit, Deps
      <3>5. \A n \in Nodes: Inv /\ Admit(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Admit, GuardAdmit, Deps
      <3>6. \A n \in Nodes: Inv /\ Admit(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Admit, GuardAdmit, Deps
      <3>7. \A n \in Nodes: Inv /\ Admit(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Admit, GuardAdmit, Deps
      <3>8. \A n \in Nodes: Inv /\ Admit(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Admit, GuardAdmit, Deps
      <3>9. \A n \in Nodes: Inv /\ Admit(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Admit, GuardAdmit, Deps
      <3>10. \A n \in Nodes: Inv /\ Admit(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Admit, GuardAdmit, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>12. \A n \in Nodes: Inv /\ CheckFiles(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ CheckFiles(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, CheckFiles, GuardCheckFiles, Deps
      <3>2. \A n \in Nodes: Inv /\ CheckFiles(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, CheckFiles, GuardCheckFiles, Deps
      <3>3. \A n \in Nodes: Inv /\ CheckFiles(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, CheckFiles, GuardCheckFiles, Deps
      <3>4. \A n \in Nodes: Inv /\ CheckFiles(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, CheckFiles, GuardCheckFiles, Deps
      <3>5. \A n \in Nodes: Inv /\ CheckFiles(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, CheckFiles, GuardCheckFiles, Deps
      <3>6. \A n \in Nodes: Inv /\ CheckFiles(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, CheckFiles, GuardCheckFiles, Deps
      <3>7. \A n \in Nodes: Inv /\ CheckFiles(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, CheckFiles, GuardCheckFiles, Deps
      <3>8. \A n \in Nodes: Inv /\ CheckFiles(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, CheckFiles, GuardCheckFiles, Deps
      <3>9. \A n \in Nodes: Inv /\ CheckFiles(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, CheckFiles, GuardCheckFiles, Deps
      <3>10. \A n \in Nodes: Inv /\ CheckFiles(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, CheckFiles, GuardCheckFiles, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>13. \A n \in Nodes: Inv /\ Complete(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ Complete(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Complete, CanSettle, Deps
      <3>2. \A n \in Nodes: Inv /\ Complete(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Complete, CanSettle, Deps
      <3>3. \A n \in Nodes: Inv /\ Complete(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Complete, CanSettle, Deps
      <3>4. \A n \in Nodes: Inv /\ Complete(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Complete, CanSettle, Deps
      <3>5. \A n \in Nodes: Inv /\ Complete(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Complete, CanSettle, Deps
      <3>6. \A n \in Nodes: Inv /\ Complete(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Complete, CanSettle, Deps
      <3>7. \A n \in Nodes: Inv /\ Complete(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Complete, CanSettle, Deps
      <3>8. \A n \in Nodes: Inv /\ Complete(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Complete, CanSettle, Deps
      <3>9. \A n \in Nodes: Inv /\ Complete(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Complete, CanSettle, Deps
      <3>10. \A n \in Nodes: Inv /\ Complete(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Complete, CanSettle, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>14. \A n \in Nodes: Inv /\ Block(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ Block(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Block, CanSettle, Deps
      <3>2. \A n \in Nodes: Inv /\ Block(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Block, CanSettle, Deps
      <3>3. \A n \in Nodes: Inv /\ Block(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Block, CanSettle, Deps
      <3>4. \A n \in Nodes: Inv /\ Block(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Block, CanSettle, Deps
      <3>5. \A n \in Nodes: Inv /\ Block(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Block, CanSettle, Deps
      <3>6. \A n \in Nodes: Inv /\ Block(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Block, CanSettle, Deps
      <3>7. \A n \in Nodes: Inv /\ Block(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Block, CanSettle, Deps
      <3>8. \A n \in Nodes: Inv /\ Block(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Block, CanSettle, Deps
      <3>9. \A n \in Nodes: Inv /\ Block(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Block, CanSettle, Deps
      <3>10. \A n \in Nodes: Inv /\ Block(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Block, CanSettle, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>15. \A n \in Nodes: Inv /\ Underspecify(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ Underspecify(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Underspecify, CanSettle, Deps
      <3>2. \A n \in Nodes: Inv /\ Underspecify(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Underspecify, CanSettle, Deps
      <3>3. \A n \in Nodes: Inv /\ Underspecify(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Underspecify, CanSettle, Deps
      <3>4. \A n \in Nodes: Inv /\ Underspecify(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Underspecify, CanSettle, Deps
      <3>5. \A n \in Nodes: Inv /\ Underspecify(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Underspecify, CanSettle, Deps
      <3>6. \A n \in Nodes: Inv /\ Underspecify(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Underspecify, CanSettle, Deps
      <3>7. \A n \in Nodes: Inv /\ Underspecify(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Underspecify, CanSettle, Deps
      <3>8. \A n \in Nodes: Inv /\ Underspecify(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Underspecify, CanSettle, Deps
      <3>9. \A n \in Nodes: Inv /\ Underspecify(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Underspecify, CanSettle, Deps
      <3>10. \A n \in Nodes: Inv /\ Underspecify(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Underspecify, CanSettle, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>16. \A n \in Nodes: Inv /\ Fail(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ Fail(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Fail, CanSettle, Deps
      <3>2. \A n \in Nodes: Inv /\ Fail(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Fail, CanSettle, Deps
      <3>3. \A n \in Nodes: Inv /\ Fail(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Fail, CanSettle, Deps
      <3>4. \A n \in Nodes: Inv /\ Fail(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Fail, CanSettle, Deps
      <3>5. \A n \in Nodes: Inv /\ Fail(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Fail, CanSettle, Deps
      <3>6. \A n \in Nodes: Inv /\ Fail(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Fail, CanSettle, Deps
      <3>7. \A n \in Nodes: Inv /\ Fail(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Fail, CanSettle, Deps
      <3>8. \A n \in Nodes: Inv /\ Fail(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Fail, CanSettle, Deps
      <3>9. \A n \in Nodes: Inv /\ Fail(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Fail, CanSettle, Deps
      <3>10. \A n \in Nodes: Inv /\ Fail(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Fail, CanSettle, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>17. \A n \in Nodes: Inv /\ EffectStale(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ EffectStale(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, EffectStale, GuardStale, Deps
      <3>2. \A n \in Nodes: Inv /\ EffectStale(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, EffectStale, GuardStale, Deps
      <3>3. \A n \in Nodes: Inv /\ EffectStale(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, EffectStale, GuardStale, Deps
      <3>4. \A n \in Nodes: Inv /\ EffectStale(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, EffectStale, GuardStale, Deps
      <3>5. \A n \in Nodes: Inv /\ EffectStale(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, EffectStale, GuardStale, Deps
      <3>6. \A n \in Nodes: Inv /\ EffectStale(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, EffectStale, GuardStale, Deps
      <3>7. \A n \in Nodes: Inv /\ EffectStale(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, EffectStale, GuardStale, Deps
      <3>8. \A n \in Nodes: Inv /\ EffectStale(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, EffectStale, GuardStale, Deps
      <3>9. \A n \in Nodes: Inv /\ EffectStale(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, EffectStale, GuardStale, Deps
      <3>10. \A n \in Nodes: Inv /\ EffectStale(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, EffectStale, GuardStale, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>18. \A n \in Nodes: Inv /\ Resume(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ Resume(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Resume, GuardResume, Deps
      <3>2. \A n \in Nodes: Inv /\ Resume(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Resume, GuardResume, Deps
      <3>3. \A n \in Nodes: Inv /\ Resume(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Resume, GuardResume, Deps
      <3>4. \A n \in Nodes: Inv /\ Resume(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Resume, GuardResume, Deps
      <3>5. \A n \in Nodes: Inv /\ Resume(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Resume, GuardResume, Deps
      <3>6. \A n \in Nodes: Inv /\ Resume(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Resume, GuardResume, Deps
      <3>7. \A n \in Nodes: Inv /\ Resume(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Resume, GuardResume, Deps
      <3>8. \A n \in Nodes: Inv /\ Resume(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Resume, GuardResume, Deps
      <3>9. \A n \in Nodes: Inv /\ Resume(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Resume, GuardResume, Deps
      <3>10. \A n \in Nodes: Inv /\ Resume(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Resume, GuardResume, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>19. \A n \in Nodes: Inv /\ Steer(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ Steer(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Steer, GuardSteer, Deps
      <3>2. \A n \in Nodes: Inv /\ Steer(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Steer, GuardSteer, Deps
      <3>3. \A n \in Nodes: Inv /\ Steer(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Steer, GuardSteer, Deps
      <3>4. \A n \in Nodes: Inv /\ Steer(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Steer, GuardSteer, Deps
      <3>5. \A n \in Nodes: Inv /\ Steer(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Steer, GuardSteer, Deps
      <3>6. \A n \in Nodes: Inv /\ Steer(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Steer, GuardSteer, Deps
      <3>7. \A n \in Nodes: Inv /\ Steer(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Steer, GuardSteer, Deps
      <3>8. \A n \in Nodes: Inv /\ Steer(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Steer, GuardSteer, Deps
      <3>9. \A n \in Nodes: Inv /\ Steer(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Steer, GuardSteer, Deps
      <3>10. \A n \in Nodes: Inv /\ Steer(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Steer, GuardSteer, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>20. \A n \in Nodes: Inv /\ Stop(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ Stop(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Stop, GuardStop, Deps
      <3>2. \A n \in Nodes: Inv /\ Stop(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Stop, GuardStop, Deps
      <3>3. \A n \in Nodes: Inv /\ Stop(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Stop, GuardStop, Deps
      <3>4. \A n \in Nodes: Inv /\ Stop(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Stop, GuardStop, Deps
      <3>5. \A n \in Nodes: Inv /\ Stop(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Stop, GuardStop, Deps
      <3>6. \A n \in Nodes: Inv /\ Stop(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Stop, GuardStop, Deps
      <3>7. \A n \in Nodes: Inv /\ Stop(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Stop, GuardStop, Deps
      <3>8. \A n \in Nodes: Inv /\ Stop(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Stop, GuardStop, Deps
      <3>9. \A n \in Nodes: Inv /\ Stop(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Stop, GuardStop, Deps
      <3>10. \A n \in Nodes: Inv /\ Stop(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Stop, GuardStop, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>21. \A n \in Nodes: Inv /\ BeginMerge(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ BeginMerge(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, BeginMerge, GuardBegin, Deps
      <3>2. \A n \in Nodes: Inv /\ BeginMerge(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, BeginMerge, GuardBegin, Deps
      <3>3. \A n \in Nodes: Inv /\ BeginMerge(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, BeginMerge, GuardBegin, Deps
      <3>4. \A n \in Nodes: Inv /\ BeginMerge(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, BeginMerge, GuardBegin, Deps
      <3>5. \A n \in Nodes: Inv /\ BeginMerge(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, BeginMerge, GuardBegin, Deps
      <3>6. \A n \in Nodes: Inv /\ BeginMerge(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, BeginMerge, GuardBegin, Deps
      <3>7. \A n \in Nodes: Inv /\ BeginMerge(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, BeginMerge, GuardBegin, Deps
      <3>8. \A n \in Nodes: Inv /\ BeginMerge(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, BeginMerge, GuardBegin, Deps
      <3>9. \A n \in Nodes: Inv /\ BeginMerge(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, BeginMerge, GuardBegin, Deps
      <3>10. \A n \in Nodes: Inv /\ BeginMerge(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, BeginMerge, GuardBegin, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>22. \A n \in Nodes: Inv /\ CommitMerge(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ CommitMerge(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, CommitMerge, GuardCommit, Deps
      <3>2. \A n \in Nodes: Inv /\ CommitMerge(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, CommitMerge, GuardCommit, Deps
      <3>3. \A n \in Nodes: Inv /\ CommitMerge(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, CommitMerge, GuardCommit, Deps
      <3>4. \A n \in Nodes: Inv /\ CommitMerge(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, CommitMerge, GuardCommit, Deps
      <3>5. \A n \in Nodes: Inv /\ CommitMerge(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, CommitMerge, GuardCommit, Deps
      <3>6. \A n \in Nodes: Inv /\ CommitMerge(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, CommitMerge, GuardCommit, Deps
      <3>7. \A n \in Nodes: Inv /\ CommitMerge(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, CommitMerge, GuardCommit, Deps
      <3>8. \A n \in Nodes: Inv /\ CommitMerge(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, CommitMerge, GuardCommit, Deps
      <3>9. \A n \in Nodes: Inv /\ CommitMerge(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, CommitMerge, GuardCommit, Deps
      <3>10. \A n \in Nodes: Inv /\ CommitMerge(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, CommitMerge, GuardCommit, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>23. \A n \in Nodes: Inv /\ MergeConflict(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ MergeConflict(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, MergeConflict, GuardConflict, Deps
      <3>2. \A n \in Nodes: Inv /\ MergeConflict(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, MergeConflict, GuardConflict, Deps
      <3>3. \A n \in Nodes: Inv /\ MergeConflict(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, MergeConflict, GuardConflict, Deps
      <3>4. \A n \in Nodes: Inv /\ MergeConflict(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, MergeConflict, GuardConflict, Deps
      <3>5. \A n \in Nodes: Inv /\ MergeConflict(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, MergeConflict, GuardConflict, Deps
      <3>6. \A n \in Nodes: Inv /\ MergeConflict(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, MergeConflict, GuardConflict, Deps
      <3>7. \A n \in Nodes: Inv /\ MergeConflict(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, MergeConflict, GuardConflict, Deps
      <3>8. \A n \in Nodes: Inv /\ MergeConflict(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, MergeConflict, GuardConflict, Deps
      <3>9. \A n \in Nodes: Inv /\ MergeConflict(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, MergeConflict, GuardConflict, Deps
      <3>10. \A n \in Nodes: Inv /\ MergeConflict(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, MergeConflict, GuardConflict, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>24. \A n \in Nodes: Inv /\ ResolveConflict(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ ResolveConflict(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, ResolveConflict, GuardResolve, Deps
      <3>2. \A n \in Nodes: Inv /\ ResolveConflict(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, ResolveConflict, GuardResolve, Deps
      <3>3. \A n \in Nodes: Inv /\ ResolveConflict(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, ResolveConflict, GuardResolve, Deps
      <3>4. \A n \in Nodes: Inv /\ ResolveConflict(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, ResolveConflict, GuardResolve, Deps
      <3>5. \A n \in Nodes: Inv /\ ResolveConflict(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, ResolveConflict, GuardResolve, Deps
      <3>6. \A n \in Nodes: Inv /\ ResolveConflict(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, ResolveConflict, GuardResolve, Deps
      <3>7. \A n \in Nodes: Inv /\ ResolveConflict(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, ResolveConflict, GuardResolve, Deps
      <3>8. \A n \in Nodes: Inv /\ ResolveConflict(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, ResolveConflict, GuardResolve, Deps
      <3>9. \A n \in Nodes: Inv /\ ResolveConflict(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, ResolveConflict, GuardResolve, Deps
      <3>10. \A n \in Nodes: Inv /\ ResolveConflict(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, ResolveConflict, GuardResolve, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>25. \A n \in Nodes: Inv /\ Remove(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ Remove(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Remove, GuardRemove, Deps
      <3>2. \A n \in Nodes: Inv /\ Remove(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Remove, GuardRemove, Deps
      <3>3. \A n \in Nodes: Inv /\ Remove(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Remove, GuardRemove, Deps
      <3>4. \A n \in Nodes: Inv /\ Remove(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Remove, GuardRemove, Deps
      <3>5. \A n \in Nodes: Inv /\ Remove(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Remove, GuardRemove, Deps
      <3>6. \A n \in Nodes: Inv /\ Remove(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Remove, GuardRemove, Deps
      <3>7. \A n \in Nodes: Inv /\ Remove(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Remove, GuardRemove, Deps
      <3>8. \A n \in Nodes: Inv /\ Remove(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Remove, GuardRemove, Deps
      <3>9. \A n \in Nodes: Inv /\ Remove(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Remove, GuardRemove, Deps
      <3>10. \A n \in Nodes: Inv /\ Remove(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Remove, GuardRemove, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>26. \A n \in Nodes: Inv /\ Reconcile(n) => Inv'
      <3>1. \A n \in Nodes: Inv /\ Reconcile(n) => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Reconcile, GuardReconcile, Deps
      <3>2. \A n \in Nodes: Inv /\ Reconcile(n) => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reconcile, GuardReconcile, Deps
      <3>3. \A n \in Nodes: Inv /\ Reconcile(n) => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reconcile, GuardReconcile, Deps
      <3>4. \A n \in Nodes: Inv /\ Reconcile(n) => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reconcile, GuardReconcile, Deps
      <3>5. \A n \in Nodes: Inv /\ Reconcile(n) => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reconcile, GuardReconcile, Deps
      <3>6. \A n \in Nodes: Inv /\ Reconcile(n) => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reconcile, GuardReconcile, Deps
      <3>7. \A n \in Nodes: Inv /\ Reconcile(n) => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reconcile, GuardReconcile, Deps
      <3>8. \A n \in Nodes: Inv /\ Reconcile(n) => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reconcile, GuardReconcile, Deps
      <3>9. \A n \in Nodes: Inv /\ Reconcile(n) => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reconcile, GuardReconcile, Deps
      <3>10. \A n \in Nodes: Inv /\ Reconcile(n) => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reconcile, GuardReconcile, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>27. Inv /\ Crash => Inv'
      <3>1. Inv /\ Crash => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Crash, Deps
      <3>2. Inv /\ Crash => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Crash, Deps
      <3>3. Inv /\ Crash => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Crash, Deps
      <3>4. Inv /\ Crash => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Crash, Deps
      <3>5. Inv /\ Crash => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Crash, Deps
      <3>6. Inv /\ Crash => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Crash, Deps
      <3>7. Inv /\ Crash => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Crash, Deps
      <3>8. Inv /\ Crash => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Crash, Deps
      <3>9. Inv /\ Crash => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Crash, Deps
      <3>10. Inv /\ Crash => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Crash, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>28. Inv /\ Reopen => Inv'
      <3>1. Inv /\ Reopen => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, Reopen, Deps
      <3>2. Inv /\ Reopen => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reopen, Deps
      <3>3. Inv /\ Reopen => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reopen, Deps
      <3>4. Inv /\ Reopen => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reopen, Deps
      <3>5. Inv /\ Reopen => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reopen, Deps
      <3>6. Inv /\ Reopen => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reopen, Deps
      <3>7. Inv /\ Reopen => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reopen, Deps
      <3>8. Inv /\ Reopen => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reopen, Deps
      <3>9. Inv /\ Reopen => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reopen, Deps
      <3>10. Inv /\ Reopen => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, Reopen, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>29. Inv /\ UNCHANGED vars => Inv'
      <3>1. Inv /\ UNCHANGED vars => TypeOK'
        BY DEF Status, GState, Inv, TypeOK, vars, Deps
      <3>2. Inv /\ UNCHANGED vars => CoreInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, vars, Deps
      <3>3. Inv /\ UNCHANGED vars => GitInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, vars, Deps
      <3>4. Inv /\ UNCHANGED vars => CouplingInv'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, vars, Deps
      <3>5. Inv /\ UNCHANGED vars => FileOwnership'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, vars, Deps
      <3>6. Inv /\ UNCHANGED vars => UndeclaredFree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, vars, Deps
      <3>7. Inv /\ UNCHANGED vars => DepsIntegratedBeyondPending'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, vars, Deps
      <3>8. Inv /\ UNCHANGED vars => SuspendedHasWorktree'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, vars, Deps
      <3>9. Inv /\ UNCHANGED vars => DispatchedDeclared'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, vars, Deps
      <3>10. Inv /\ UNCHANGED vars => MergingExcludesIntegrated'
        BY DEF Status, GState, Inv, TypeOK, CoreInv, GitInv, CouplingInv, FileOwnership, UndeclaredFree, DepsIntegratedBeyondPending, SuspendedHasWorktree, DispatchedDeclared, MergingExcludesIntegrated, vars, Deps
      <3>11. QED
        BY <3>1, <3>2, <3>3, <3>4, <3>5, <3>6, <3>7, <3>8, <3>9, <3>10 DEF Inv
    <2>30. QED
      BY <2>1, <2>2, <2>3, <2>4, <2>5, <2>6, <2>7, <2>8, <2>9, <2>10, <2>11, <2>12, <2>13, <2>14, <2>15, <2>16, <2>17, <2>18, <2>19, <2>20, <2>21, <2>22, <2>23, <2>24, <2>25, <2>26, <2>27, <2>28, <2>29
         DEF Next, vars

  <1>3. QED
    BY <1>1, <1>2, PTL DEF Spec

=========================================================================
