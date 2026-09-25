/**
 * pi extension entry point.
 *
 * Two roles in one extension:
 *
 *  - the **dispatcher** session owns the single durable DAG store and the
 *    worktree dispatcher;
 *  - a **node** session (spawned with `DAG_RESULT` set) gets exactly one tool,
 *    `dag_report`, the structured outcome channel back to the dispatcher.
 *
 * The DAG does not depend on the message board. If the board is installed, node
 * agents inherit it independently for peer chat; nothing here changes.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { initDagState, type DagState } from "./engine/state.ts";
import { DagDispatcher, PiSpawner } from "./extension/dispatcher.ts";
import { buildReportTool, isNodeProcess } from "./extension/dag-report.ts";
import { DagStore, type DagPersistence } from "./extension/store.ts";
import { buildDagTool } from "./extension/tool.ts";

/** The custom-entry type that carries the complete composed snapshot. */
export const DAG_STATE_ENTRY = "dag/state";

/** Fold the newest persisted DAG snapshot out of a session branch. */
export function latestSnapshot(ctx: ExtensionContext): DagState | null {
  let latest: DagState | null = null;
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "custom" && entry.customType === DAG_STATE_ENTRY && entry.data !== undefined) {
      latest = entry.data as DagState;
    }
  }
  return latest;
}

/** Default export consumed by pi. */
export default function dagExtension(pi: ExtensionAPI): void {
  // A dispatched node process is a worker, not a scheduler: one channel only.
  if (isNodeProcess()) {
    pi.registerTool(buildReportTool(process.env.DAG_RESULT!));
    return;
  }

  let store: DagStore | null = null;
  const persistence: DagPersistence = { append: (snapshot) => pi.appendEntry(DAG_STATE_ENTRY, snapshot) };

  const reload = (ctx: ExtensionContext): void => {
    store = new DagStore(persistence, latestSnapshot(ctx) ?? initDagState());
  };
  const getStore = (ctx: ExtensionContext): DagStore => {
    if (store === null) reload(ctx);
    return store!;
  };
  const getDispatcher = (ctx: ExtensionContext): DagDispatcher => new DagDispatcher(getStore(ctx), ctx.cwd, new PiSpawner());

  pi.on("session_start", (_event, ctx) => reload(ctx));
  pi.on("session_tree", (_event, ctx) => reload(ctx));
  pi.on("session_shutdown", () => {
    store = null;
  });

  pi.registerTool(buildDagTool(getStore, getDispatcher));

  pi.registerCommand("dag", {
    description: "Show the durable DAG board and worktree phases",
    handler: async (_args, ctx) => {
      const board = getStore(ctx).board;
      const lines = [`revision ${board.revision}`, `ready: ${board.ready.join(", ") || "(none)"}`];
      for (const node of board.nodes) {
        const phase = getStore(ctx).state.nodes[node.id]?.gstate ?? "absent";
        lines.push(`  ${node.id}: ${node.status} (gen ${node.gen}, worktree ${phase})`);
      }
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
