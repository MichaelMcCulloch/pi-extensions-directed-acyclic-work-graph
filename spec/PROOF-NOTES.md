# Inductive proof notes (TLAPS)

`spec/DagSystemProof.tla` proves, for **every** `Nodes`, `Edges`, `Files`,
`MaxGen`, `MaxDropped`:

```
THEOREM Safety ==
  ASSUME MaxGen \in Nat, MaxDropped \in Nat
  PROVE Spec => []Inv
```

Status: **all 664 obligations proved** by tlapm 1.6.0-pre.

## Toolchain

| Tool | Where | Status |
|---|---|---|
| tlapm 1.6.0-pre | `~/.local/tlapm/bin/tlapm` | works; bundles backends, uses the system Z3 |
| Z3 4.16 | `/usr/bin/z3` (pacman) | works with tlapm 1.6 |
| stdlib | `~/.local/tlapm/lib/tlapm/stdlib` | `-I` this |
| TLAPS 1.5.0 | `~/.local/tlaps` | **do not use**: the 1.5 installer shipped only `tlapm` (no Zenon, no SMT wrapper), so nothing discharges |

Run with `node scripts/tlapm.mjs` (honours `TLAPM` and `TLAPM_LIBRARY`), or
directly from `spec/`:

```bash
PATH="$HOME/.local/tlapm/bin:$PATH" \
  tlapm -I "$HOME/.local/tlapm/lib/tlapm/stdlib" DagSystemProof.tla
```

## Spec layout

- `DagSystem.tla` is parameterized: `CONSTANTS Nodes, Edges, Files, MaxGen,
  MaxDropped`, with `Deps(n) == {m \in Nodes : <<m, n>> \in Edges}`.
- `DagSystemFixture.tla` is the TLC fixture: it declares the 15 state variables
  and `INSTANCE DagSystem WITH` concrete `Nodes/Edges/Files/MaxGen/MaxDropped`
  **and** the variables. `DagSystemFixture.cfg` references `Spec`/`Inv` directly.
- `TraceValidation.tla` extends the fixture, so it inherits the instantiated
  variables and actions.
- `scripts/tla.mjs` runs the fixture for the `model` step; the count key stays
  `"DagSystem"`.
- `DagSystemProof.tla` is the TLAPS proof module (not used by TLC).

## Proof structure

1. `<1>1. Init => Inv` — one step per invariant component.
2. `<1>2. Inv /\ [Next]_vars => Inv'` — one case per action (26 node actions,
   `Crash`, `Reopen`, stutter), each split into one step per component, then a
   propositional `QED`.
3. `<1>3. QED BY <1>1, <1>2, PTL DEF Spec`.

## What the proof required (and what it taught us)

**`Inv` was not inductive as first stated.** TLC had only shown it reachable on
the fixture. TLAPS forced five strengthenings, each true in every reachable
state, each now in `Inv` and mirrored in `src/formal/system-model.ts`:

| Strengthening | Why induction needs it |
|---|---|
| `UndeclaredFree` | an orphaned node is declared, and an undeclared or orphaned node holds no files; together with `Declare`'s `~declared[n]` guard this keeps a fresh declaration disjoint from every node's files |
| `DepsIntegratedBeyondPending` | a suspended node resumed/steered/stopped back to `starting` must still satisfy the dependency coupling |
| `SuspendedHasWorktree` | steering a suspended node back to `starting` must not lose its worktree |
| `DispatchedDeclared` | a finished node entering the merge phase has a non-`absent` git state, so it must be declared |
| `MergingExcludesIntegrated` | a conflict cannot leave an already-integrated node in the `conflicted` state |

**Side conditions.** The theorem assumes `MaxGen \in Nat` and `MaxDropped \in
Nat`; without them `0..MaxGen` is not well-founded. The fixture hid this by
instantiating numerals.

**Practical TLAPS notes.**

- Named sets must be unfolded: every `TypeOK` obligation needs `DEF Status,
  GState`, or they are uninterpreted symbols.
- Large `DEF` lists make the SMT backend fail on otherwise simple arithmetic
  (`gen[n] < MaxGen => gen[n] + 1 <= MaxGen`). The `TypeOK` cases therefore use
  a reduced `DEF` list (`Status, GState, Inv, TypeOK, <action>, <guards>,
  Deps`), while the other components use the full list.
- A lexically bound `n` from a `\A n \in Nodes:` goal is not in scope for
  structured sub-steps; use `SUFFICES ASSUME NEW n \in Nodes ...` if splitting
  is needed.
- `ASSUME NEW n \in Nodes, Inv, Action(n) PROVE ...` does **not** add `Inv` and
  `Action(n)` as hypotheses; only the `NEW` part is introduced.

## Why this is enough for ∀N

`<1>2` is an induction over the transition relation with no appeal to
finiteness: every action preserves `Inv` for arbitrary constants. Together with
`<1>1` and `PTL`, `Spec => []Inv` holds for every reachable state of every
instance. TLC remains the *executable* check on a fixture, the source of the
count cross-check, and the only check of **liveness** (which is not proved for
arbitrary N).
