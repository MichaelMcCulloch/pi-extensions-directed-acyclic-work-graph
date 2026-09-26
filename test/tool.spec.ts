import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DagDispatcher, type NodeReport, type SpawnRequest, type Spawner } from "../src/extension/dispatcher.ts";
import { DagStore } from "../src/extension/store.ts";
import { buildDagTool } from "../src/extension/tool.ts";
import { modelDeclarations } from "./helpers.ts";

const ctx = { sessionManager: { getSessionId: () => "dispatcher" } } as unknown as ExtensionContext;

class NoopSpawner implements Spawner {
  public async spawn(_request: SpawnRequest): Promise<NodeReport> {
    return { outcome: "blocked", summary: "not used" };
  }
}

function tool(store: DagStore) {
  const build = () =>
    buildDagTool(
      () => store,
      () => new DagDispatcher(store, ".", new NoopSpawner()),
    );
  return build();
}

function text(result: { content: readonly unknown[] }): string {
  const part = result.content[0] as { type?: string; text?: string } | undefined;
  return part?.type === "text" ? (part.text ?? "") : "";
}

describe("dag tool", () => {
  it("declares a graph and reports the ready set", async () => {
    const store = new DagStore({ append() {} });
    const result = await tool(store).execute!(
      "c",
      { action: "write", nodes: modelDeclarations() as never },
      undefined,
      undefined,
      ctx,
    );
    expect(text(result)).toContain("n1");
    expect(result.details.revision).toBe(store.state.revision);
  });

  it("reads status and inspects one node", async () => {
    const store = new DagStore({ append() {} });
    store.declare(modelDeclarations());
    const status = await tool(store).execute!("c", { action: "status" }, undefined, undefined, ctx);
    expect(text(status)).toContain("revision");
    const inspect = await tool(store).execute!("c", { action: "inspect", node: "n1" }, undefined, undefined, ctx);
    expect(text(inspect)).toContain("\"n1\"");
  });

  it("surfaces a refusal as a thrown tool error so the agent sees the fault", async () => {
    const store = new DagStore({ append() {} });
    // Returning the refusal as content would be recorded as a successful call
    // (`isError: false`); throwing is the only way to signal failure.
    await expect(
      tool(store).execute!("c", { action: "inspect", node: "missing" }, undefined, undefined, ctx),
    ).rejects.toThrow(/dag-unknown-node/);
  });

  it("dry-runs a declaration and reports the diff without applying", async () => {
    const store = new DagStore({ append() {} });
    store.declare(modelDeclarations());
    const revision = store.state.revision;
    const result = await tool(store).execute!(
      "c",
      { action: "write", nodes: modelDeclarations() as never, dry_run: true },
      undefined,
      undefined,
      ctx,
    );
    expect(text(result)).toContain("dry-run");
    expect(text(result)).toContain("unchanged n1, n2, n3");
    expect(store.state.revision).toBe(revision);
  });

  it("reports the plan waves", async () => {
    const store = new DagStore({ append() {} });
    store.declare(modelDeclarations());
    const result = await tool(store).execute!("c", { action: "plan" }, undefined, undefined, ctx);
    expect(text(result)).toBe("plan: w1 n1 (ready) → w2 n2 (pending) → w3 n3 (pending)");
  });

  it("blocks and unblocks a pending node", async () => {
    const store = new DagStore({ append() {} });
    store.declare(modelDeclarations());
    const blocked = await tool(store).execute!(
      "c",
      { action: "block", node: "n3", reason: "external release" },
      undefined,
      undefined,
      ctx,
    );
    expect(text(blocked)).toContain("external release");
    expect(store.state.nodes["n3"]!.status).toBe("parked");
    const unblocked = await tool(store).execute!("c", { action: "unblock", node: "n3" }, undefined, undefined, ctx);
    expect(text(unblocked)).toContain("unparked");
    expect(store.state.nodes["n3"]!.status).toBe("pending");
  });
});
