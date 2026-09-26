/**
 * pi extension entry point.
 *
 * Two roles in one extension:
 *
 *  - the **dispatcher** session owns the single durable DAG store and the
 *    worktree dispatcher;
 *  - a **node** session (spawned with `DAG_RESULT` set) gets exactly one tool,
 *    `dag_report`, the structured outcome channel back to the dispatcher, plus a
 *    best-effort progress reporter so the dispatcher can show live token and
 *    tool-call counts.
 *
 * The DAG does not depend on the message board. If the board is installed, node
 * agents inherit it independently for peer chat; nothing here changes.
 *
 * While the dispatcher works, a persistent widget above the editor repaints the
 * board on every store commit and on a telemetry poll, so in-progress nodes spin
 * and their counters climb. `/dag` opens the full scrollable detail.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { initDagState, type DagState } from "./engine/state.ts";
import { DagDispatcher, PiSpawner } from "./extension/dispatcher.ts";
import { buildReportTool, isNodeProcess } from "./extension/dag-report.ts";
import { DagStore, type DagPersistence } from "./extension/store.ts";
import { buildDagTool } from "./extension/tool.ts";
import { DagExplorer, DagWidget, renderDagBoard, renderDagDetail, renderDagTree } from "./extension/hud.ts";
import { installProgressReporter, readTelemetry, type NodeProgress } from "./extension/telemetry.ts";

/** The custom-entry type that carries the complete composed snapshot. */
export const DAG_STATE_ENTRY = "dag/state";

/** The widget slot above the editor. */
const WIDGET_KEY = "dag-board";

/** How often to re-read node telemetry so counters and spinners stay live. */
const POLL_MS = 500;

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
    const result = process.env["DAG_RESULT"]!;
    pi.registerTool(buildReportTool(result));
    installProgressReporter(pi, result, process.env["DAG_NODE"] ?? "node");
    return;
  }

  let store: DagStore | null = null;
  let currentCtx: ExtensionContext | null = null;
  let widgetTui: TUI | null = null;
  let widgetInstalled = false;
  let telemetry = new Map<string, NodeProgress>();
  let poll: NodeJS.Timeout | null = null;

  const hideWidget = (): void => {
    if (widgetInstalled && currentCtx !== null && currentCtx.mode === "tui" && currentCtx.hasUI) {
      currentCtx.ui.setWidget(WIDGET_KEY, undefined);
    }
    widgetInstalled = false;
  };

  /** Re-read telemetry, show/hide the widget, and repaint. */
  const refreshWidget = (): void => {
    const ctx = currentCtx;
    if (ctx === null) return;
    telemetry = readTelemetry(getStore(ctx).state, telemetry);
    if (ctx.mode !== "tui" || !ctx.hasUI) return;
    if (getStore(ctx).board.nodes.length === 0) {
      hideWidget();
      return;
    }
    if (!widgetInstalled) {
      ctx.ui.setWidget(WIDGET_KEY, (tui, theme) => {
        widgetTui = tui;
        return new DagWidget(
          () => renderDagTree(getStore(ctx), telemetry),
          12,
          () => void openExplorer(currentCtx ?? ctx),
          () => currentCtx?.ui.theme ?? theme,
        );
      });
      widgetInstalled = true;
    }
    widgetTui?.requestRender();
  };

  const stopPolling = (): void => {
    if (poll !== null) {
      clearInterval(poll);
      poll = null;
    }
  };
  const startPolling = (): void => {
    stopPolling();
    poll = setInterval(refreshWidget, POLL_MS);
    poll.unref?.();
  };

  const persistence: DagPersistence = {
    append: (snapshot) => {
      pi.appendEntry(DAG_STATE_ENTRY, snapshot);
      // The dispatcher mutates the store in the background; repaint on commit.
      refreshWidget();
    },
  };

  const reload = (ctx: ExtensionContext): void => {
    const snapshot = latestSnapshot(ctx);
    store = new DagStore(persistence, snapshot ?? initDagState());
    // Effects and merges are process-local: a restored snapshot's ephemeral
    // fields are stale by definition, so run the model's recovery.
    if (snapshot !== null) store.recover();
  };
  const getStore = (ctx: ExtensionContext): DagStore => {
    if (store === null) reload(ctx);
    return store!;
  };
  const getDispatcher = (ctx: ExtensionContext): DagDispatcher => new DagDispatcher(getStore(ctx), ctx.cwd, new PiSpawner());

  pi.on("session_start", (_event, ctx) => {
    currentCtx = ctx;
    reload(ctx);
    refreshWidget();
    startPolling();
  });
  pi.on("session_tree", (_event, ctx) => {
    currentCtx = ctx;
    reload(ctx);
    refreshWidget();
  });
  pi.on("session_shutdown", () => {
    stopPolling();
    hideWidget();
    store = null;
    currentCtx = null;
    widgetTui = null;
    telemetry = new Map();
  });

  pi.registerTool(buildDagTool(getStore, getDispatcher));

  const openExplorer = async (ctx: ExtensionContext): Promise<void> => {
    if (ctx.mode !== "tui" || !ctx.hasUI) return;
    await ctx.ui.custom<undefined>(
      (tui, theme, _keybindings, done) =>
        new DagExplorer(
          (width) => renderDagDetail(getStore(ctx), width, telemetry),
          tui,
          () => ctx.ui.theme,
          () => done(undefined),
        ),
      { overlay: true, overlayOptions: { width: "92%", maxHeight: "92%", anchor: "center", margin: 1 } },
    );
  };

  pi.registerCommand("dag", {
    description: "Show the durable DAG board; open the scrollable explorer",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui" || !ctx.hasUI) {
        ctx.ui.notify(renderDagBoard(getStore(ctx), telemetry).join("\n"), "info");
        return;
      }
      await openExplorer(ctx);
    },
  });
}
