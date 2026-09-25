/**
 * The model-facing `dag` tool.
 *
 * The tool declares the graph and runs it. The lifecycle is driven by the
 * dispatcher against the single verified store, and node agents report through
 * `dag_report`; there is no manual control-plane path that could place the
 * machine in a state the model does not allow.
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { NodeDeclaration } from "../engine/state.ts";
import type { DagDispatcher } from "./dispatcher.ts";
import type { DagStore } from "./store.ts";
import { DagOperationError } from "./store.ts";

/** Actions the model may issue. */
export const DAG_ACTIONS = ["write", "status", "inspect", "run"] as const;

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
  nodes: Type.Optional(Type.Array(NodeDeclarationSchema, { description: "The complete node list for write." })),
  node: Type.Optional(Type.String({ description: "Node id for inspect." })),
  node_ids: Type.Optional(Type.Array(Type.String(), { description: "Ready node ids for run." })),
  generation: Type.Optional(Type.Integer({ description: "Worktree generation for run; defaults to 1." })),
});

interface DagDetails {
  readonly action: string;
  readonly revision: number;
  readonly error?: string;
  readonly board?: unknown;
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
      "Declare and run a dependency graph. write declares the complete node list; status reads the board; inspect reads one node; run dispatches the ready nodes into git worktrees, spawns an agent in each, and integrates their commits when they complete.",
    promptSnippet: "dag: declare and run a dependency graph in git worktrees",
    promptGuidelines: [
      "Use dag action=write once with the complete node list, then action=status to see the ready nodes.",
      "Use dag action=run with the ready node ids; each node runs in its own git worktree and is merged on completion.",
    ],
    parameters: DagParams,
    executionMode: "sequential",
    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<{ content: { type: "text"; text: string }[]; details: DagDetails }> {
      const store = getStore(ctx);
      try {
        if (params.action === "run") {
          const nodes = params.node_ids ?? [];
          if (nodes.length === 0) throw new DagOperationError("dag-missing-nodes", "run requires node_ids");
          const results = await getDispatcher(ctx).run(nodes, params.generation ?? 1);
          return {
            content: [{ type: "text", text: JSON.stringify(results) }],
            details: { action: "run", revision: store.state.revision, board: results },
          };
        }
        if (params.action === "write") {
          if (params.nodes === undefined) throw new DagOperationError("dag-missing-nodes", "write requires the node list");
          const result = store.declare(params.nodes as readonly NodeDeclaration[]);
          return {
            content: [
              {
                type: "text",
                text: `DAG declared: ${params.nodes.length} node(s) at revision ${result.state.revision}. Ready: ${result.board.ready.join(", ") || "(none)"}.`,
              },
            ],
            details: { action: "write", revision: result.state.revision, board: result.board },
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

function renderBoard(store: DagStore): string {
  const board = store.board;
  const lines = [`revision ${board.revision}`, `counts ${JSON.stringify(board.counts)}`, `ready ${board.ready.join(", ") || "(none)"}`];
  for (const node of board.nodes) {
    const phase = store.state.nodes[node.id]?.gstate ?? "absent";
    lines.push(`- ${node.id}: ${node.status} (gen ${node.gen}, worktree ${phase})`);
  }
  return lines.join("\n");
}
