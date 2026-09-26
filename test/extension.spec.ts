import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import dagExtension, { DAG_STATE_ENTRY, latestSnapshot } from "../src/index.ts";
import { DagStore } from "../src/extension/store.ts";
import { initDagState } from "../src/engine/state.ts";
import { modelDeclarations } from "./helpers.ts";

function fakeCtx(branch: readonly unknown[]): ExtensionContext {
  return {
    sessionManager: { getBranch: () => branch },
  } as unknown as ExtensionContext;
}

describe("extension wiring", () => {
  it("registers the tool, the command, and the lifecycle handlers", () => {
    const tools: string[] = [];
    const commands: string[] = [];
    const events: string[] = [];
    const pi = {
      on: (event: string) => {
        events.push(event);
      },
      registerTool: (tool: { name: string }) => {
        tools.push(tool.name);
      },
      registerCommand: (name: string) => {
        commands.push(name);
      },
      appendEntry: () => {},
    } as unknown as ExtensionAPI;

    dagExtension(pi);
    expect(tools).toEqual(["dag"]);
    expect(commands).toEqual(["dag"]);
    expect(events).toContain("session_start");
    expect(events).toContain("session_tree");
  });

  it("folds the newest persisted snapshot and ignores other entries", () => {
    const first = initDagState();
    const store = new DagStore({ append() {} });
    store.declare(modelDeclarations());
    const second = store.state;
    const branch = [
      { type: "message", message: {} },
      { type: "custom", customType: "other", data: { nope: true } },
      { type: "custom", customType: DAG_STATE_ENTRY, data: first },
      { type: "custom", customType: DAG_STATE_ENTRY, data: second },
    ];
    expect(latestSnapshot(fakeCtx(branch))).toBe(second);
  });

  it("returns null for an empty branch", () => {
    expect(latestSnapshot(fakeCtx([]))).toBeNull();
  });
});
