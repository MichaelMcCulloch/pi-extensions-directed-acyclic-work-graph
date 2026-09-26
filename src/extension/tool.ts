/**
 * The model-facing `dag` tool.
 *
 * Declaration is idempotent: `write` declares the whole graph (absent nodes are
 * orphaned, not deleted) and `add` upserts; both accept `dry_run` and
 * `expect_revision`. `edit`/`link`/`unlink` change a node's definition (marking
 * it stale once it has left pending), while `block`/`unblock` park a node on an
 * external condition and `reset` clears a stale definition. `run` dispatches
 * every ready node, and with `follow` keeps dispatching as completions unlock
 * dependents. There is no manual control-plane path that could place the
 * machine in a state the model does not allow.
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { NodeDeclaration } from "../engine/state.ts";
import type { DagDispatcher } from "./dispatcher.ts";
import type { DeclarationResult, DagStore } from "./store.ts";
import { DagOperationError } from "./store.ts";

/** Actions the model may issue. */
export const DAG_ACTIONS = [
  "write",
  "add",
  "edit",
  "link",
  "unlink",
  "remove",
  "block",
  "unblock",
  "reset",
  "status",
  "plan",
  "inspect",
  "run",
] as const;

const NodeDeclarationSchema = Type.Object({
  id: Type.String({ description: "Stable node id." }),
  content: Type.String({ description: "What the node must produce." }),
  brief: Type.String({ description: "Must contain VALIDATION: and ACCEPTANCE: sections." }),
  deps: Type.Array(Type.String(), { description: "Node ids this node waits for." }),
  kind: Type.Optional(StringEnum(["task", "integration"] as const)),
  files: Type.Optional(Type.Array(Type.String(), { description: "Declared files; exclusive across the graph." })),
  policy: Type.Optional(
    StringEnum(["delegate", "ours", "theirs", "halt"] as const, {
      description: "Merge-conflict policy.",
    }),
  ),
  noop: Type.Optional(Type.Boolean({ description: "A node that legitimately produces no commit." })),
});

const DagParams = Type.Object({
  action: StringEnum(DAG_ACTIONS),
  nodes: Type.Optional(
    Type.Array(NodeDeclarationSchema, { description: "Node list for write (complete) or add (partial)." }),
  ),
  node: Type.Optional(Type.String({ description: "Node id for edit/link/unlink/remove/block/unblock/reset/inspect." })),
  node_ids: Type.Optional(Type.Array(Type.String(), { description: "Ready node ids for run; omit to dispatch all ready." })),
  deps: Type.Optional(Type.Array(Type.String(), { description: "Dependency ids for link/unlink, or the new deps for edit." })),
  content: Type.Optional(Type.String({ description: "New content for edit." })),
  brief: Type.Optional(Type.String({ description: "New brief for edit; must keep VALIDATION:/ACCEPTANCE:." })),
  files: Type.Optional(Type.Array(Type.String(), { description: "New declared files for edit." })),
  kind: Type.Optional(StringEnum(["task", "integration"] as const)),
  policy: Type.Optional(StringEnum(["delegate", "ours", "theirs", "halt"] as const)),
  noop: Type.Optional(Type.Boolean()),
  generation: Type.Optional(Type.Integer({ description: "Worktree generation for run; defaults to 1." })),
  prune: Type.Optional(Type.Boolean({ description: "write: physically delete nodes absent from the list." })),
  dry_run: Type.Optional(Type.Boolean({ description: "Return the diff without applying (write/add/edit)." })),
  expect_revision: Type.Optional(Type.Integer({ description: "Refuse if the store is not at this revision." })),
  reason: Type.Optional(Type.String({ description: "Why a node is blocked." })),
  follow: Type.Optional(Type.Boolean({ description: "run: keep dispatching as completions unlock dependents." })),
  until_idle: Type.Optional(Type.Boolean({ description: "run: alias for follow." })),
});

interface DagDetails {
  readonly action: string;
  readonly revision: number;
  readonly error?: string;
  readonly diff?: unknown;
  readonly warnings?: readonly string[];
  readonly board?: unknown;
  readonly plan?: unknown;
  readonly results?: unknown;
}

/** Build the tool against a lazily constructed store and dispatcher. */
export function buildDagTool(
  getStore: (ctx: ExtensionContext) => DagStore,
  getDispatcher: (ctx: ExtensionContext) => DagDispatcher,
): ToolDefinition<typeof DagParams, DagDetails> {
  return {
    name: "dag",
    label: "DAG",
    description:
      "Declare and run a dependency graph. write declares the complete node list (idempotent merge-by-id; absent nodes are orphaned unless prune), add upserts, edit/link/unlink change a definition, block/unblock park a node, reset clears a stale node, status/plan read the board, and run dispatches every ready node into git worktrees (follow keeps dispatching as waves unlock).",
    promptSnippet: "dag: declare and run a dependency graph in git worktrees",
    promptGuidelines: [
      "Declare the whole graph with dag action=write once; re-running the same declaration is safe and changes nothing.",
      "Use dag action=run with no node_ids to dispatch every ready node; add follow=true to keep dispatching waves until idle.",
      "Snapshot before a big re-declaration with dry_run=true to see added/updated/orphaned/edges.",
    ],
    parameters: DagParams,
    executionMode: "sequential",
    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<{ content: { type: "text"; text: string }[]; details: DagDetails }> {
      const store = getStore(ctx);
      try {
        if (params.action === "run") {
          const nodes = params.node_ids ?? store.board.ready;
          const follow = params.follow === true || params.until_idle === true;
          if (nodes.length === 0 && !follow) {
            return {
              content: [{ type: "text", text: "no ready nodes" }],
              details: { action: "run", revision: store.state.revision, results: [] },
            };
          }
          const results = await getDispatcher(ctx).run(nodes, params.generation ?? 1, {
            follow,
            untilIdle: params.until_idle === true,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(results) }],
            details: { action: "run", revision: store.state.revision, board: results, results },
          };
        }
        if (params.action === "write" || params.action === "add") {
          if (params.nodes === undefined) throw new DagOperationError("dag-missing-nodes", `${params.action} requires the node list`);
          const result = store.declare(params.nodes as readonly NodeDeclaration[], {
            mode: params.action === "add" ? "add" : "write",
            prune: params.prune === true,
            dryRun: params.dry_run === true,
            ...(params.expect_revision !== undefined ? { expectRevision: params.expect_revision } : {}),
          });
          return declarationReply(params.action, result);
        }
        if (params.action === "edit") {
          requireNode(params.node);
          const patch = {
            ...(params.content !== undefined ? { content: params.content } : {}),
            ...(params.brief !== undefined ? { brief: params.brief } : {}),
            ...(params.deps !== undefined ? { deps: params.deps } : {}),
            ...(params.files !== undefined ? { files: params.files } : {}),
            ...(params.kind !== undefined ? { kind: params.kind } : {}),
            ...(params.policy !== undefined ? { policy: params.policy } : {}),
            ...(params.noop !== undefined ? { noop: params.noop } : {}),
          };
          const result = store.edit(params.node, patch, {
            dryRun: params.dry_run === true,
            ...(params.expect_revision !== undefined ? { expectRevision: params.expect_revision } : {}),
          });
          return declarationReply("edit", result);
        }
        if (params.action === "link" || params.action === "unlink") {
          requireNode(params.node);
          if (params.deps === undefined) throw new DagOperationError("dag-missing-deps", `${params.action} requires deps`);
          const result =
            params.action === "link" ? store.link(params.node, params.deps) : store.unlink(params.node, params.deps);
          return declarationReply(params.action, result);
        }
        if (params.action === "remove") {
          requireNode(params.node);
          return declarationReply("remove", store.prune(params.node));
        }
        if (params.action === "block") {
          requireNode(params.node);
          const result = store.park(params.node, params.reason ?? "blocked");
          return {
            content: [{ type: "text", text: `${params.node} parked${params.reason ? `: ${params.reason}` : ""}` }],
            details: { action: "block", revision: result.state.revision, board: result.board },
          };
        }
        if (params.action === "unblock") {
          requireNode(params.node);
          const result = store.unpark(params.node);
          return {
            content: [{ type: "text", text: `${params.node} unparked` }],
            details: { action: "unblock", revision: result.state.revision, board: result.board },
          };
        }
        if (params.action === "reset") {
          requireNode(params.node);
          const result = store.reset(params.node);
          return {
            content: [{ type: "text", text: `${params.node} reset to pending` }],
            details: { action: "reset", revision: result.state.revision, board: result.board },
          };
        }
        if (params.action === "plan") {
          return {
            content: [{ type: "text", text: renderPlan(store) }],
            details: { action: "plan", revision: store.state.revision, plan: store.plan },
          };
        }
        if (params.action === "status") {
          return {
            content: [{ type: "text", text: renderBoard(store) }],
            details: { action: "status", revision: store.state.revision, board: store.board },
          };
        }
        if (params.node === undefined || params.node.length === 0) {
          throw new DagOperationError("dag-missing-node", "inspect requires a node id");
        }
        const node = store.state.nodes[params.node];
        if (node === undefined) throw new DagOperationError("dag-unknown-node", `unknown node ${params.node}`);
        return {
          content: [{ type: "text", text: JSON.stringify(node) }],
          details: { action: "inspect", revision: store.state.revision },
        };
      } catch (error) {
        if (error instanceof DagOperationError) {
          return {
            content: [{ type: "text", text: `dag ${params.action} refused: ${error.message}` }],
            details: { action: params.action, revision: store.state.revision, error: error.code },
          };
        }
        throw error;
      }
    },
  };
}

function requireNode(node: string | undefined): asserts node is string {
  if (node === undefined || node.length === 0) throw new DagOperationError("dag-missing-node", "this action requires a node id");
}

function declarationReply(
  action: string,
  result: DeclarationResult,
): { content: { type: "text"; text: string }[]; details: DagDetails } {
  const { diff } = result;
  const parts = [
    `${result.applied ? "applied" : "dry-run"} ${action} at revision ${result.state.revision}:`,
    `added ${list(diff.added)}; adopted ${list(diff.adopted)}; updated ${list(diff.updated)}; unchanged ${list(diff.unchanged)}; orphaned ${list(diff.orphaned)}; removed ${list(diff.removed)}`,
  ];
  if (diff.edges_added.length > 0) parts.push(`edges added: ${diff.edges_added.join(", ")}`);
  if (diff.edges_removed.length > 0) parts.push(`edges removed: ${diff.edges_removed.join(", ")}`);
  if (diff.stale.length > 0) parts.push(`marked stale: ${diff.stale.join(", ")} (reset to re-run)`);
  if (result.warnings.length > 0) parts.push(`warnings: ${result.warnings.join("; ")}`);
  if (result.applied && result.board.ready.length > 0) parts.push(`ready: ${result.board.ready.join(", ")}`);
  return {
    content: [{ type: "text", text: parts.join("\n") }],
    details: {
      action,
      revision: result.state.revision,
      diff,
      warnings: result.warnings,
      board: result.board,
    },
  };
}

function list(items: readonly string[]): string {
  return items.length === 0 ? "(none)" : items.join(", ");
}

function renderBoard(store: DagStore): string {
  const board = store.board;
  const lines = [
    `revision ${board.revision}`,
    `counts ${JSON.stringify(board.counts)}`,
    `ready ${list(board.ready)}`,
  ];
  for (const node of board.nodes) {
    const phase = store.state.nodes[node.id]?.gstate ?? "absent";
    const flags: string[] = [];
    if (node.orphaned) flags.push("orphaned");
    if (node.blockedReason !== null) flags.push(`blocked: ${node.blockedReason}`);
    if (node.staleReason !== null) flags.push(`stale: ${node.staleReason}`);
    const waiting = node.waitingOn.length > 0 ? ` waiting on ${node.waitingOn.map((w) => `${w.dep} (${w.reason})`).join(", ")}` : "";
    lines.push(`- ${node.id}: ${node.status}${flags.length > 0 ? ` [${flags.join("; ")}]` : ""} (gen ${node.gen}, worktree ${phase})${waiting}`);
  }
  return lines.join("\n");
}

function renderPlan(store: DagStore): string {
  const plan = store.plan;
  if (plan.waves.length === 0) return "plan: (no active nodes)";
  return `plan: ${plan.waves.map((wave) => `w${wave.index} ${wave.nodes.join(", ")}`).join(" → ")}`;
}
