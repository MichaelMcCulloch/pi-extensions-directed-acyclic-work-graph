import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { initDagState, type DagState } from "../src/engine/state.ts";
import { installProgressReporter, readProgress, readTelemetry } from "../src/extension/telemetry.ts";

type Handler = (event: unknown) => void;

function fakePi(): { pi: ExtensionAPI; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>();
  const pi = {
    on: (name: string, handler: Handler) => {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI;
  return { pi, handlers };
}

describe("node progress telemetry", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("sums tokens, counts tool calls, and records the last tool", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-telemetry-"));
    dirs.push(dir);
    const resultFile = join(dir, "node.result.json");
    const { pi, handlers } = fakePi();
    installProgressReporter(pi, resultFile, "alpha");

    handlers.get("message_end")!({ message: { role: "assistant", usage: { totalTokens: 1_200 } } });
    handlers.get("message_end")!({ message: { role: "assistant", usage: { totalTokens: 345 } } });
    handlers.get("message_end")!({ message: { role: "user" } });
    handlers.get("tool_execution_start")!({ toolName: "read" });
    handlers.get("tool_execution_start")!({ toolName: "bash" });

    const progress = readProgress(resultFile);
    expect(progress?.node).toBe("alpha");
    expect(progress?.tokens).toBe(1_545);
    expect(progress?.toolCalls).toBe(2);
    expect(progress?.lastTool).toBe("bash");
  });

  it("returns null for a missing sidecar", () => {
    expect(readProgress(join(tmpdir(), "definitely-missing-dag.result.json"))).toBeNull();
  });

  it("reads telemetry keyed by node id for every worktree", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-telemetry-"));
    dirs.push(dir);
    const worktree = join(dir, "n1");
    const { pi, handlers } = fakePi();
    installProgressReporter(pi, `${worktree}.result.json`, "n1");
    handlers.get("tool_execution_start")!({ toolName: "edit" });

    const state = { ...initDagState(), order: ["n1"], nodes: { n1: { worktree } } } as unknown as DagState;
    const telemetry = readTelemetry(state);
    expect(telemetry.get("n1")?.toolCalls).toBe(1);
    expect(telemetry.get("n1")?.lastTool).toBe("edit");

    // A worktree without a sidecar contributes nothing.
    const empty = { ...initDagState(), order: ["n2"], nodes: { n2: { worktree: join(dir, "missing") } } } as unknown as DagState;
    expect(readTelemetry(empty).size).toBe(0);
  });

  it("keeps last-known counters for terminal nodes without re-reading", () => {
    const previous = new Map([
      [
        "n1",
        { node: "n1", tokens: 900, toolCalls: 7, startedAt: 0, updatedAt: 0, lastTool: "edit" },
      ],
    ]);
    // The worktree does not exist; the cached value must be returned anyway.
    const state = {
      ...initDagState(),
      order: ["n1"],
      nodes: { n1: { worktree: join(tmpdir(), "gone"), status: "completed" } },
    } as unknown as DagState;
    expect(readTelemetry(state, previous).get("n1")?.tokens).toBe(900);
  });
});
