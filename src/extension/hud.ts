/**
 * Terminal presentation for the DAG.
 *
 * Two surfaces, both driven by the same pure renderers:
 *
 *  - a persistent widget above the editor, so the board is visible while the
 *    dispatcher works (the dispatcher mutates the store continuously; the
 *    widget repaints on every commit and on the telemetry poll);
 *  - an `/dag` explorer overlay that scrolls the full node detail.
 *
 * Nothing here re-derives the machine: the board is `DagStore.board` (the
 * verified guard's ready set), the detail is `DagStore.state`, and the live
 * counters come from each node's telemetry sidecar.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi, type Component, type TUI, type TuiMouseEvent, type TuiMouseEventResult } from "@earendil-works/pi-tui";
import type { SystemStatus } from "../formal/system-model.ts";
import type { DagState } from "../engine/state.ts";
import type { DagStore } from "./store.ts";
import type { NodeProgress } from "./telemetry.ts";

const STATUS_MARK: Readonly<Record<SystemStatus, string>> = {
  pending: "○",
  starting: "◌",
  in_progress: "▶",
  completed: "✓",
  blocked: "⛔",
  failed: "✗",
  interrupted: "⚠",
  underspecified: "?",
};

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const ACTIVE_STATUSES: ReadonlySet<SystemStatus> = new Set(["starting", "in_progress"]);

/** The current spinner frame; in-progress nodes animate as the widget repaints. */
export function spinnerFrame(now: number = Date.now()): string {
  return SPINNER_FRAMES[Math.floor(now / 120) % SPINNER_FRAMES.length]!;
}

/** Compact token counts: 812, 4.2k, 1.3M. */
export function formatTokens(value: number): string {
  if (value < 1_000) return `${value}`;
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

/** The live-counter suffix for one node, or empty when there is no telemetry yet. */
function telemetrySuffix(progress: NodeProgress | undefined): string {
  if (progress === undefined) return "";
  const last = progress.lastTool === null ? "" : ` · ${progress.lastTool}`;
  return ` · ↓${formatTokens(progress.tokens)} tok · ${progress.toolCalls} tools${last}`;
}

/** One compact line per node: spinner/mark, id, status, worktree phase, telemetry. */
export function nodeLine(
  state: DagState,
  id: string,
  ready: ReadonlySet<string>,
  telemetry: ReadonlyMap<string, NodeProgress> = new Map(),
  now: number = Date.now(),
): string {
  const node = state.nodes[id];
  const status = node?.status ?? "pending";
  const mark = ACTIVE_STATUSES.has(status) ? spinnerFrame(now) : (STATUS_MARK[status] ?? "?");
  const phase = node?.gstate ?? "absent";
  const flag = ready.has(id) ? " · ready" : "";
  const deps = node !== undefined && node.deps.length > 0 ? ` · deps: ${node.deps.join(",")}` : "";
  return `${mark} ${id} · ${status} · gen ${node?.gen ?? 0} · ${phase}${flag}${deps}${telemetrySuffix(telemetry.get(id))}`;
}

/** The compact board: header, ready set, then every node. */
export function renderDagBoard(
  store: DagStore,
  telemetry: ReadonlyMap<string, NodeProgress> = new Map(),
  now: number = Date.now(),
): string[] {
  const board = store.board;
  if (board.nodes.length === 0) return ["DAG · no nodes declared — use the dag tool to declare one"];
  const ready = new Set(board.ready);
  const lines = [
    `DAG · rev ${board.revision} · ${board.counts.completed}/${board.nodes.length} done · ${board.ready.length} ready`,
  ];
  if (board.ready.length > 0) lines.push(`ready: ${board.ready.join(", ")}`);
  for (const node of board.nodes) lines.push(nodeLine(store.state, node.id, ready, telemetry, now));
  return lines;
}

/** The dependency tree: goals on top, each goal's prerequisites nested below. */
export function renderDagTree(
  store: DagStore,
  telemetry: ReadonlyMap<string, NodeProgress> = new Map(),
  now: number = Date.now(),
): string[] {
  const board = store.board;
  if (board.nodes.length === 0) return ["DAG · no nodes declared — use the dag tool to declare one"];
  const state = store.state;
  const ready = new Set(board.ready);
  const deps = new Map(board.nodes.map((node) => [node.id, node.deps] as const));

  // Goals are nodes nothing depends on; every other node hangs beneath one.
  const isDependency = new Set<string>();
  for (const node of board.nodes) for (const dep of node.deps) isDependency.add(dep);
  const goals = board.nodes.map((node) => node.id).filter((id) => !isDependency.has(id));
  const roots = goals.length > 0 ? goals : board.nodes.map((node) => node.id);

  const lines = [`DAG · ${board.counts.completed}/${board.nodes.length} done · ${board.ready.length} ready`];
  const shown = new Set<string>();
  const label = (id: string): string => {
    const status = state.nodes[id]?.status ?? "pending";
    const mark = ACTIVE_STATUSES.has(status) ? spinnerFrame(now) : (STATUS_MARK[status] ?? "?");
    const flag = ready.has(id) ? " · ready" : "";
    return `${mark} ${id}${flag}${telemetrySuffix(telemetry.get(id))}`;
  };
  const walk = (id: string, prefix: string, isLast: boolean, isRoot: boolean): void => {
    const connector = isRoot ? "" : `${prefix}${isLast ? "└─ " : "├─ "}`;
    const seen = shown.has(id);
    lines.push(`${connector}${label(id)}${seen ? "  ↳" : ""}`);
    if (seen) return;
    shown.add(id);
    const children = deps.get(id) ?? [];
    children.forEach((child, index) => {
      const childIsLast = index === children.length - 1;
      const childPrefix = isRoot ? "" : `${prefix}${isLast ? "   " : "│  "}`;
      walk(child, childPrefix, childIsLast, false);
    });
  };
  roots.forEach((id) => walk(id, "", true, true));
  return lines;
}

/** The full board: each node followed by its declaration, git facts, and telemetry. */
export function renderDagDetail(
  store: DagStore,
  width: number,
  telemetry: ReadonlyMap<string, NodeProgress> = new Map(),
  now: number = Date.now(),
): string[] {
  const board = store.board;
  const ready = new Set(board.ready);
  const lines = [
    `revision ${board.revision} · ${board.counts.completed}/${board.nodes.length} done · ${board.ready.length} ready`,
    ...(board.ready.length > 0 ? [`ready: ${board.ready.join(", ")}`] : []),
    "",
  ];
  if (board.nodes.length === 0) {
    lines.push("no nodes declared");
    return lines;
  }
  const wrap = Math.max(20, width - 4);
  for (const node of board.nodes) {
    const full = store.state.nodes[node.id];
    const mark = ACTIVE_STATUSES.has(node.status) ? spinnerFrame(now) : (STATUS_MARK[node.status] ?? "?");
    lines.push(`${mark} ${node.id}  [${node.status}]${telemetrySuffix(telemetry.get(node.id))}`);
    const facts: string[] = [
      `deps: ${node.deps.length > 0 ? node.deps.join(", ") : "(none)"}${ready.has(node.id) ? "  · ready" : ""}`,
      `generation ${node.gen}${full !== undefined ? ` · worktree ${full.gstate}` : ""}${full?.merging === true ? " · merging" : ""}`,
    ];
    if (full !== undefined) {
      if (full.files.length > 0) facts.push(`files: ${full.files.join(", ")}`);
      facts.push(`policy: ${full.policy}${full.kind === "integration" ? " · integration" : ""}${full.noop ? " · noop" : ""}`);
      if (full.branch !== null) facts.push(`branch: ${full.branch}`);
      if (full.worktree !== null) facts.push(`worktree: ${full.worktree}`);
      if (full.completedCommit !== null) facts.push(`completed: ${full.completedCommit.slice(0, 12)}`);
      if (full.mergeCommit !== null) facts.push(`merge: ${full.mergeCommit.slice(0, 12)}`);
    }
    for (const fact of facts) lines.push(`    ${fact}`);
    if (full !== undefined && full.brief.trim().length > 0) {
      lines.push("    brief:");
      for (const wrapped of wrapTextWithAnsi(full.brief.trim(), wrap)) lines.push(`      ${wrapped}`);
    }
    lines.push("");
  }
  return lines;
}

/** A full-width rule, dimmed when a theme is available. */
function separator(width: number, theme: Theme | undefined): string {
  const line = "─".repeat(Math.max(0, width));
  return theme === undefined ? line : theme.fg("borderMuted", line);
}

/** The persistent widget. `lines` is read on every render so it is always live. */
export class DagWidget implements Component {
  public constructor(
    private readonly lines: () => string[],
    private readonly maxLines = 12,
    private readonly onActivate?: () => void,
    private readonly getTheme?: () => Theme,
  ) {}

  public invalidate(): void {
    // Rendering reads the live board each frame.
  }

  public handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type === "click" && event.button === "left" && this.onActivate !== undefined) {
      this.onActivate();
      return { handled: true };
    }
    return undefined;
  }

  public render(width: number): string[] {
    const body = this.lines();
    if (body.length === 0) return [];
    const shown = body.slice(0, this.maxLines);
    if (body.length > this.maxLines) shown.push(`… +${body.length - this.maxLines} more — click to open`);
    const fitted = shown.map((line) => truncateToWidth(line, width, "…", true));
    return [separator(width, this.getTheme?.()), ...fitted];
  }
}

/** The scrollable `/dag` explorer overlay. */
export class DagExplorer implements Component {
  #scroll = 0;
  #total = 0;

  public constructor(
    private readonly body: (width: number) => string[],
    private readonly tui: TUI,
    private readonly getTheme: () => Theme,
    private readonly done: () => void,
  ) {}

  public invalidate(): void {
    // The body is recomputed from the live store each render.
  }

  public handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c") || matchesKey(data, "q")) {
      this.done();
      return;
    }
    if (matchesKey(data, Key.up)) this.#scroll -= 1;
    else if (matchesKey(data, Key.down)) this.#scroll += 1;
    else if (matchesKey(data, Key.pageUp)) this.#scroll -= this.#viewport();
    else if (matchesKey(data, Key.pageDown)) this.#scroll += this.#viewport();
    else if (matchesKey(data, Key.home)) this.#scroll = 0;
    else if (matchesKey(data, Key.end)) this.#scroll = Number.MAX_SAFE_INTEGER;
    this.#clamp();
    this.tui.requestRender();
  }

  public render(width: number): string[] {
    const theme = this.getTheme();
    const lines: string[] = [];
    lines.push(truncateToWidth(theme.bold(theme.fg("accent", "DAG board")) + theme.fg("dim", "   ↑/↓ scroll · q close"), width, "…", true));
    lines.push(theme.fg("borderMuted", "─".repeat(Math.max(0, width))));
    const body = this.body(Math.max(20, width - 2));
    this.#total = body.length;
    this.#clamp();
    const viewport = this.#viewport();
    const end = Math.min(body.length, this.#scroll + viewport);
    for (let i = this.#scroll; i < end; i++) lines.push(truncateToWidth(body[i] ?? "", width, "…", true));
    for (let i = end - this.#scroll; i < viewport; i++) lines.push(" ".repeat(Math.max(0, width)));
    lines.push(theme.fg("borderMuted", "─".repeat(Math.max(0, width))));
    const range = body.length === 0 ? "0/0" : `${this.#scroll + 1}-${end}/${body.length}`;
    lines.push(truncateToWidth(theme.fg("dim", range), width, "…", true));
    return lines;
  }

  #viewport(): number {
    return Math.max(3, this.tui.terminal.rows - 6);
  }

  #clamp(): void {
    const max = Math.max(0, this.#total - this.#viewport());
    if (this.#scroll < 0) this.#scroll = 0;
    else if (this.#scroll > max) this.#scroll = max;
  }
}
