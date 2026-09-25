# Retired half-models

`DagOrchestrator.tla` (scheduler) and `DagGit.tla` (worktree/integration) were
the first two verification subjects. They are kept here as documentation of how
the system was decomposed, but they are **no longer part of the verified set**.

The single verification subject is now `../DagSystem.tla`, the synchronous
product of both halves plus declared file ownership and the coupling invariants.
Retiring the halves removes the refinement obligation between three models: with
one product, the interoperations are checked directly rather than asserted as
projections.
