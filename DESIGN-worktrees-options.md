# DAG worktrees, waves, and spawning — design proposal

Status: **proposal, open for discussion.** No code written yet; the message-board
increment landed first (see the bottom of this file).

## 1. Your proposed semantics, restated

1. On `dispatch`, each node gets a git worktree at
   `<repo-root>/.worktrees/<node-name>/`, on a branch off its parent (root for
   roots), and a pi subagent is spawned **inside that worktree**.
2. The agent works; it reports `complete`, `blocked`, or `underspecified`.
3. `complete` is accepted only if the work is committed and the node HEAD is at
   least one commit ahead of its parent SHA; otherwise the agent is told to
   commit.
4. A **wave** is a layer: all nodes whose dependencies are in earlier waves.
   A wave is complete when all its nodes complete.
5. On wave completion, worktrees that share a parent are merged into that
   parent — not before.
6. Merge conflict ⇒ the wave is marked `blocked` and the dispatcher is
   preempted. Alternative: spawn a resolver agent in the conflicted worktree
   with the full instruction set of both sides.
7. After merges, delete the worktree dirs and `git worktree prune`; then notify.
8. Next wave branches off the now-merged parents; repeat.

## 2. The one place the proposal is internally inconsistent

"Merge into the parent" and "delete the parent worktree after the wave merge"
cannot both hold. After wave 1, A's worktree is deleted once A merges into root.
Wave 2's A.1 then has no A worktree to branch from or merge into; and a commit in
root is not a merge target.

Your worked example resolves this implicitly — after wave 2, root contains
`A.1, A.2, A.3, B.1` — i.e. the children's work ends up in **root**, not in a
resurrected A. So "parent" in the merge sentence really means "the integration
branch", and today that is root/main.

Three coherent readings:

| | Base of a node | Merge target | Pros | Cons |
|---|---|---|---|---|
| **A. Flat** (matches your example) | current root HEAD | root | dead simple; one integration line; matches the worked example | a node's worktree contains unrelated sibling work; every merge is against the whole root |
| **B. Hierarchical** (deepseek-harness style) | parent's integration branch | parent's integration branch | true "merge into parent"; small merge surfaces; subtree can land as one unit | many integration branches; needs a rule for when a subtree is done; more machinery |
| **C. Flat + declared base** (my recommendation) | wave base + the recorded completion commits of this node's deps | root | keeps A's simplicity and your example; a node's tree contains only what it declared; DAG deps (not just tree parents) work | base and merge target differ, so the recorded base must be durable |

I recommend **C**, because a DAG is not a tree: a node may depend on two
siblings, and "branch off the parent" has no single meaning there. C makes the
base explicit and durable, which is also exactly what closes the crash windows.

## 3. Recommended semantics (Option C), precisely

- **Wave base**: before a wave opens, probe the root worktree (clean, symbolic
  branch, valid HEAD), then freeze the branch and commit. All nodes in the wave
  share this base.
- **Node base**: `wave base` + `git merge` of the exact **recorded completion
  commits** of the node's declared deps, in declared order. Never branch tips,
  never re-derived at retry time.
- **Worktree**: `git worktree add <root>/.worktrees/<gen>/<node> -b dsh/dag/<gen>/<node> <base>`.
  The generation component prevents stale reuse after a re-declaration.
  `.worktrees/` must be gitignored and the root must be clean.
- **Spawn**: a nested `pi` process with `cwd` = the worktree (see §6). The
  dispatcher process keeps the DAG store; the child does not get `dag`.
- **Completion**: the child reports an outcome; the dispatcher then checks on
  the *node base*, not root:
  - branch is the expected one; worktree clean; no merge in progress;
  - every declared dep completion commit is an ancestor of HEAD;
  - `git rev-list --count <base>..HEAD` ≥ 1, unless the node is declared
    `kind: integration` or `no-op: true` (otherwise a verification node can
    never complete);
  - record `completedCommit = HEAD`.
- **Wave merge**: when every node in the wave is complete, merge their
  `completedCommit`s into root in **declaration order**, recording
  `mergeCommit[node]` after each. Merging is **idempotent**: a commit already an
  ancestor of root is a no-op. On conflict: see §5.
- **Worktree removal**: only after `completedCommit` is an ancestor of root.
  Then `git worktree remove` (fall back to a scoped `rm -rf` +
  `git worktree prune`). A worktree is never removed while it holds unmerged
  commits.
- **Persistence**: the wave machine, each node's `base`, `depCommits`,
  `completedCommit`, `mergeCommit`, and worktree path are durable, and every
  git effect is a recorded two-phase transition (see §4).

## 4. What this does to the formalism

The current verified core is the product of Node / Command / Effect machines.
This adds three machines, composed with it:

| Machine | State | Owns |
|---|---|---|
| `WaveMachine` | `collecting → running → merging → settled \| blocked` | the wave barrier and its merge batch |
| `WorktreeMachine` (per node) | `absent → created → merging → merged → removed` (+ `stranded`, `conflicted`) | the git worktree lifetime |
| `MergeMachine` (per wave member) | `pending → merged \| conflicted` | idempotent integration into root |

New invariants worth model-checking:

- **`NoLostWork`** — for every node that reached `merged`, `completedCommit` is
  an ancestor of root *before* its worktree leaves `created`. This is the
  property the whole design exists to protect.
- **`MergeIdempotent`** — re-running the merge of an already-merged commit is a
  no-op (state unchanged). Verified as a transition property.
- **`WaveBarrier`** — no node of wave *N+1* enters `created` before wave *N* is
  `settled`.
- **`WorktreeUnique`** — at most one live worktree per node, paths pairwise
  distinct, every path under the worktree root.
- **`FileOwnership`** — declared files are pairwise disjoint across a wave
  (this is the sibling-collision rule; the reference enforces it along
  dependency edges, but for parallel merges the siblings are what matter).
- **`CleanRoot`** — a wave only opens from a clean root with a valid HEAD.

Crash windows to verify (each is a real bug of this shape, and the reference
found one of them the hard way — its `preparedFrom` window could record the
wrong no-op discriminator after a restart):

| Kill point | Required behavior |
|---|---|
| after `worktree add`, before recording it | reopen adopts the worktree instead of failing; a repair transition for a path that exists but is unregistered |
| after a merge, before recording `mergeCommit` | retry re-merges idempotently; `completedCommit` never changes |
| after recording `mergeCommit`, before removal | removal resumes; no re-merge churn |
| after `complete`, before the wave merges | the wave resumes and merges the recorded commit |
| mid-`git worktree add` (dir exists, unregistered) | explicit repair, as in the dag note's "stranded node id" case |

This is a bigger state space than the current model, so it should be verified as
a **separate TLC configuration** (`DagGit.tla` or an extended `DagOrchestrator`
with a small node set), reusing the existing Node/Command/Effect module.

## 5. Conflict policy — my recommendation

Make it a per-node (or per-wave) policy, not a global choice:

- `delegate` — spawn a **resolver node** in the merge state. Its brief is
  auto-built from both sides' briefs + the conflicting file list + the exact
  commits; it must commit a resolution or report `blocked`/`underspecified`.
  Resolution is itself a node with a worktree and the same completion checks, so
  it cannot loop silently.
- `ours` / `theirs` — deterministic, for cases where the dispatcher already
  knows the precedence.
- `halt` — mark the wave `blocked`, leave the partial merges in place
  (idempotent, so a retry resumes), and preempt the dispatcher via a pi message.

Default: `delegate` for integration nodes, `halt` for task nodes. Partial-wave
state is safe because merging is idempotent; a retry or a resolver picks up from
the recorded `mergeCommit`s.

## 6. Spawning subagents — reuse, don't reinvent

pi's affordance is the nested-process pattern the bundled `subagent` example
uses (`pi -p`, JSON mode, `cwd` set). Concretely:

- Dispatcher spawns `pi` with `cwd = worktree`, the node brief, and the
  worktree's branch as context.
- The child gets the normal code tools plus the **message board** (already
  installed, so it inherits it with no cross-wiring, exactly as you said).
- The child reports its outcome over the board (a post to `dag/results/<wave>`
  or a direct message to the dispatcher's mailbox), and exits. The dispatcher
  holds the DAG store, validates git, and settles the node.
- Alternative if you want children to call `dag complete` directly: make the DAG
  state a shared file (the same locked read-modify-write backend the board now
  uses). That is more work and puts git checks in the child; I'd keep them in
  the dispatcher.

## 7. Reuse ledger (so we don't rebuild wheels)

| Need | Reuse |
|---|---|
| Agent runtime | pi nested process / Agent SDK |
| Child→parent reporting | the message board we just built |
| Cross-node coordination | the message board |
| Git operations | `git worktree`, `git merge`, `git prune` — never a reimplementation |
| Durable two-phase records | the reference's `preparedFrom`/`preparedHead` pattern |
| Wave probe | the reference's porcelain-v2 clean/symbolic/HEAD check |
| Sibling file safety | the reference's declared-file ownership rule, widened to waves |
| Node/command/effect lifecycle | the existing verified DAG model |

## 8. Questions I'd like your call on

1. **Integration shape**: Option A (root-only, simplest, matches your example),
   B (hierarchical integration branches), or C (flat + declared base, my
   recommendation)?
2. **Merge strategy**: merge commits (preserves the DAG, provenance) or rebase
   (linear history, rewrites commits)? I lean to merge commits.
3. **Conflict default**: `halt` + preempt you, `delegate` to a resolver node, or
   policy per node (my recommendation)?
4. **`underspecified`**: a first-class status, or `blocked` with
   `reason: underspecified`? And after the dispatcher answers, does the node
   `resume` (new message, same worktree) or restart?
5. **Wave scheduling**: strict barriers (your model, simple), or dispatch ready
   nodes continuously and merge per-dependency? I'd ship barriers first.
6. **Worktree naming**: `.worktrees/<generation>/<sanitized-node>` under root,
   `.worktrees/` gitignored; refuse to run if root is dirty or `.worktrees` is
   tracked. Good?
7. **Dispatcher checkpoints**: run waves automatically to completion, or stop
   for approval at each wave boundary?
8. **Reporting channel**: board post vs a shared dag store the child writes
   directly. I recommend the board.

## Message-board increment (landed)

Named mailboxes + lease reclaim, verified:

- Mailboxes are **names**; an agent `bind`s a name to serve it (exclusive). A
  send to an unbound name is a **durable inbox** a later session can drain — the
  gap where "a message to an exited session sat unread" is closed.
- `reclaim` revokes a lease (the runtime's TTL trigger), so a fetched-but-unacked
  message is never stranded.
- TLC: **3,312 distinct states**, safety (`BindExclusive`, `OwnerRegistered`,
  `Placement`, `Fifo`, `Bounded`, `LeaseRecipient`, `Unforgeable`, forum rules)
  and liveness (`AckedTerminal`, `LeaseClears`, and a **conditional**
  `QueuedDelivered` — delivery is only promised while a mailbox has an owner,
  because an unbound name is a durable inbox, not a promise).
- 26 tests, trace validation, and the TS↔TLC state-count cross-check all green.
