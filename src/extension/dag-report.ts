/**
 * The node → dispatcher control channel.
 *
 * Deliberately not a message board: one structured report per node, written to
 * the result file the dispatcher gave the child in `DAG_RESULT`. It is the only
 * communication the DAG requires, so the DAG never couples to the board. If the
 * board is installed, node agents may use it for peer chat; nothing here changes.
 */

import { writeFileSync } from "node:fs";
import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { NodeOutcomeKind, NodeReport } from "./dispatcher.ts";

const ReportParams = Type.Object({
  outcome: StringEnum(["complete", "blocked", "underspecified"] as const, {
    description: "complete = done; blocked = understood but impossible; underspecified = ambiguous request.",
  }),
  summary: Type.String({ description: "One-line summary for the dispatcher." }),
});

/** Parse a report file, or null when it is absent or malformed. */
export function readReport(raw: string): NodeReport | null {
  try {
    const parsed = JSON.parse(raw) as { outcome?: string; summary?: string };
    const outcome = parsed.outcome;
    if (outcome !== "complete" && outcome !== "blocked" && outcome !== "underspecified" && outcome !== "failed") {
      return null;
    }
    return { outcome, summary: parsed.summary ?? "" };
  } catch {
    return null;
  }
}

/** Write a report to the path the dispatcher provided. */
export function writeReport(path: string, report: NodeReport): void {
  writeFileSync(path, JSON.stringify(report), "utf8");
}

/**
 * The child-scoped reporting tool. Registered only when the child was spawned
 * as a node (`DAG_RESULT` present), so a plain session never sees it.
 */
export function buildReportTool(resultPath: string): ToolDefinition<typeof ReportParams, { outcome: string }> {
  return {
    name: "dag_report",
    label: "DAG Report",
    description:
      "Report this node's outcome to the dispatcher. complete = finished and committed; blocked = the request is understood but cannot be fulfilled; underspecified = multiple interpretations, unclear which to carry out.",
    promptSnippet: "dag_report: report this node's outcome to the dispatcher",
    promptGuidelines: [
      "Commit your work, then call dag_report with outcome=complete.",
      "Use outcome=blocked when you understand the request but cannot fulfill it.",
      "Use outcome=underspecified when the request has several interpretations; the dispatcher will clarify and resume you.",
    ],
    parameters: ReportParams,
    executionMode: "sequential",
    async execute(_id, params): Promise<{ content: { type: "text"; text: string }[]; details: { outcome: string } }> {
      const report: NodeReport = { outcome: params.outcome as NodeOutcomeKind, summary: params.summary };
      writeReport(resultPath, report);
      return {
        content: [{ type: "text", text: `reported ${report.outcome} to the dispatcher` }],
        details: { outcome: report.outcome },
      };
    },
  };
}

/** True when this process is a dispatched node. */
export function isNodeProcess(): boolean {
  return typeof process.env.DAG_RESULT === "string" && process.env.DAG_RESULT.length > 0;
}

/** The result path injected by the dispatcher, if any. */
export function nodeResultPath(_ctx: ExtensionContext): string | null {
  return isNodeProcess() ? process.env.DAG_RESULT! : null;
}
