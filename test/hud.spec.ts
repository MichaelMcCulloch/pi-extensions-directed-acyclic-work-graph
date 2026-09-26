import { describe, expect, it } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { DagStore } from "../src/extension/store.ts";
import { DagWidget, formatTokens, nodeLine, renderDagBoard, renderDagDetail, renderDagTree, spinnerFrame } from "../src/extension/hud.ts";
import type { NodeProgress } from "../src/extension/telemetry.ts";
import { modelDeclarations } from "./helpers.ts";

function declared(): DagStore {
  const store = new DagStore({ append: () => {} });
  store.declare(modelDeclarations());
  return store;
}

describe("dag hud renderers", () => {
  it("renders a header and one line per node", () => {
    const board = renderDagBoard(declared());
    expect(board[0]).toContain("0/3 done");
    expect(board[0]).toContain("1 ready");
    expect(board.some((line) => line.includes("n1") && line.includes("ready"))).toBe(true);
    expect(board.some((line) => line.includes("n2") && line.includes("deps: n1"))).toBe(true);
  });

  it("marks completed nodes with their own glyph", () => {
    const base = declared().state;
    const nodes = { ...base.nodes, n1: { ...base.nodes["n1"]!, status: "completed" as const } };
    const line = nodeLine({ ...base, nodes }, "n1", new Set());
    expect(line.startsWith("✓")).toBe(true);
    expect(line).toContain("completed");
  });

  it("renders full detail with dependencies, policy, and the brief", () => {
    const detail = renderDagDetail(declared(), 80).join("\n");
    expect(detail).toContain("deps: n1");
    expect(detail).toContain("policy: halt");
    expect(detail).toContain("brief:");
    expect(detail).toContain("VALIDATION");
  });

  it("renders an empty board without throwing", () => {
    const empty = new DagStore({ append: () => {} });
    expect(renderDagBoard(empty)[0]).toContain("no nodes declared");
    expect(renderDagDetail(empty, 60)).toContain("no nodes declared");
  });

  it("renders goals on top with prerequisites nested, and no revision", () => {
    const lines = renderDagTree(declared());
    expect(lines[0]).toContain("0/3 done");
    expect(lines[0]).not.toContain("rev");
    expect(lines[1]).toContain("n3");
    expect(lines[2]).toMatch(/└─ ○ n2/);
    expect(lines[3]).toMatch(/\s+└─ ○ n1/);
    expect(lines[3]).toContain("ready");
  });
});

describe("live telemetry rendering", () => {
  it("formats token counts compactly", () => {
    expect(formatTokens(812)).toBe("812");
    expect(formatTokens(4_200)).toBe("4.2k");
    expect(formatTokens(1_300_000)).toBe("1.3M");
  });

  it("returns a stable spinner frame for a given time", () => {
    expect(spinnerFrame(0)).toBe("⠋");
    expect(spinnerFrame(0)).toBe(spinnerFrame(0));
  });

  it("spins on active nodes and appends tokens and tool calls", () => {
    const base = declared().state;
    const nodes = { ...base.nodes, n1: { ...base.nodes["n1"]!, status: "in_progress" as const } };
    const progress: NodeProgress = { node: "n1", tokens: 1_545, toolCalls: 3, startedAt: 0, updatedAt: 0, lastTool: "bash" };
    const line = nodeLine({ ...base, nodes }, "n1", new Set(), new Map([["n1", progress]]), 0);
    expect(line.startsWith("⠋")).toBe(true);
    expect(line).toContain("↓1.5k tok");
    expect(line).toContain("3 tools");
    expect(line).toContain("bash");
  });

  it("leaves pending nodes unadorned and static", () => {
    const line = nodeLine(declared().state, "n2", new Set());
    expect(line.startsWith("○")).toBe(true);
    expect(line).not.toContain("tok");
  });
});

describe("DagWidget", () => {
  it("fits every line to the requested width", () => {
    const widget = new DagWidget(() => renderDagBoard(declared()));
    for (const line of widget.render(40)) expect(visibleWidth(line)).toBe(40);
  });

  it("caps long boards and says how many were omitted", () => {
    const widget = new DagWidget(() => ["one", "two", "three", "four"], 2);
    const lines = widget.render(30);
    // separator + two kept + omission hint
    expect(lines).toHaveLength(4);
    expect(visibleWidth(lines[0]!)).toBe(30);
    expect(lines[3]).toContain("+2 more");
  });

  it("renders nothing when the board is empty", () => {
    expect(new DagWidget(() => []).render(30)).toEqual([]);
  });

  it("activates on a left click", () => {
    let clicks = 0;
    const widget = new DagWidget(() => ["one"], 12, () => {
      clicks += 1;
    });
    const event = { type: "click", button: "left", x: 1, y: 1, screenX: 1, screenY: 1, width: 40, height: 1, shift: false, alt: false, ctrl: false } as const;
    expect(widget.handleMouse(event)).toEqual({ handled: true });
    expect(clicks).toBe(1);
    expect(widget.handleMouse({ ...event, type: "move" })).toBeUndefined();
  });
});
