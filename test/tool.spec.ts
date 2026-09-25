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

  it("returns a refusal instead of throwing", async () => {
    const store = new DagStore({ append() {} });
    const result = await tool(store).execute!("c", { action: "inspect", node: "missing" }, undefined, undefined, ctx);
    expect(result.details.error).toBe("dag-unknown-node");
    expect(text(result)).toContain("refused");
  });
});
