------------------------- MODULE DagSystemFixture -------------------------
\* The TLC fixture for the parameterized DagSystem: two nodes, one edge, two
\* files, and the bounds used by the trace corpus. The fixture declares the
\* state variables and substitutes them into the instance, so `Spec`, `Inv`, and
\* every action are directly usable (by the driver and by TraceValidation).
\* -------------------------------------------------------------------------

EXTENDS Naturals

VARIABLES
    declared, files, orphaned, status, gen, cmd, effect, effectFence,
    completedGen, dropped, gstate, committed, integrated, registered,
    merging, checked

INSTANCE DagSystem WITH
    Nodes            <- {"n1", "n2"},
    Edges            <- {<<"n1", "n2">>},
    Files            <- {"f1", "f2"},
    MaxGen           <- 2,
    MaxDropped       <- 4,
    declared         <- declared,
    files            <- files,
    orphaned         <- orphaned,
    status           <- status,
    gen              <- gen,
    cmd              <- cmd,
    effect           <- effect,
    effectFence      <- effectFence,
    completedGen     <- completedGen,
    dropped          <- dropped,
    gstate           <- gstate,
    committed        <- committed,
    integrated       <- integrated,
    registered       <- registered,
    merging          <- merging,
    checked          <- checked

=============================================================================
