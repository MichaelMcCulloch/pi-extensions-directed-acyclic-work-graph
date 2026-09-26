/**
 * Per-node live telemetry.
 *
 * A node agent is a separate `pi -p` process with closed stdio, so it cannot
 * stream progress directly. Instead it writes a small sidecar next to its result
 * file; the dispatcher-side widget reads it. Telemetry is deliberately *not*
 * part of `DagState`: it is observation, not machine state, so it can never
 * change a verified transition.
 */

import { readFileSync, writeFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { DagState } from "../engine/state.ts";
import { resultPath } from "./dispatcher.ts";

const ACTIVE_STATUSES: ReadonlySet<string> = new Set(["starting", "in_progress"]);

/** One node's live counters, as written by the child and read by the parent. */
export interface NodeProgress {
  readonly node: string;
  readonly tokens: number;
  readonly toolCalls: number;
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly lastTool: string | null;
}

/** The sidecar path derived from the node's result path. */
export function progressPathFor(resultFile: string): string {
  return `${resultFile}.progress.json`;
}

/** Read one node's progress, or null when absent or malformed. */
export function readProgress(resultFile: string): NodeProgress | null {
  try {
    const parsed = JSON.parse(readFileSync(progressPathFor(resultFile), "utf8")) as Partial<NodeProgress>;
    if (typeof parsed.tokens !== "number" || typeof parsed.toolCalls !== "number") return null;
    return {
      node: typeof parsed.node === "string" ? parsed.node : "",
      tokens: parsed.tokens,
      toolCalls: parsed.toolCalls,
      startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : 0,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
      lastTool: typeof parsed.lastTool === "string" ? parsed.lastTool : null,
    };
  } catch {
    return null;
  }
}

/** Read the telemetry for every node that has a worktree, keyed by node id.
 *  Terminal nodes keep their last-known counters instead of re-reading each poll. */
export function readTelemetry(state: DagState, previous?: ReadonlyMap<string, NodeProgress>): Map<string, NodeProgress> {
  const telemetry = new Map<string, NodeProgress>();
  for (const id of state.order) {
    const node = state.nodes[id];
    if (node === undefined || node.worktree === null) continue;
    if (!ACTIVE_STATUSES.has(node.status) && previous?.has(id)) {
      telemetry.set(id, previous.get(id)!);
      continue;
    }
    const progress = readProgress(resultPath(node.worktree));
    if (progress !== null) telemetry.set(id, progress);
  }
  return telemetry;
}

/**
 * Child-side reporter. Sums assistant usage and counts tool executions, then
 * rewrites the sidecar. Best-effort: a failed write never disturbs the node.
 */
export function installProgressReporter(pi: ExtensionAPI, resultFile: string, node: string): void {
  const path = progressPathFor(resultFile);
  const startedAt = Date.now();
  let tokens = 0;
  let toolCalls = 0;
  let lastTool: string | null = null;

  const flush = (): void => {
    try {
      writeFileSync(path, JSON.stringify({ node, tokens, toolCalls, startedAt, updatedAt: Date.now(), lastTool }));
    } catch {
      // Telemetry is best-effort and must never fail a node.
    }
  };

  pi.on("message_end", (event) => {
    if (event.message.role !== "assistant") return;
    tokens += event.message.usage.totalTokens;
    flush();
  });

  pi.on("tool_execution_start", (event) => {
    toolCalls += 1;
    lastTool = event.toolName;
    flush();
  });

  flush();
}
