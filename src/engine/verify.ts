/**
 * Production invariant.
 *
 * The base is the composed model's invariant — the same predicate TLC checks in
 * `spec/DagSystem.tla`, applied to the production projection. The extra checks
 * are durable bookkeeping that the model does not carry (revision, receipts,
 * declaration order).
 */

import { systemInvariantViolations, type SystemViolation } from "../formal/system-model.ts";
import { abstractSystemState, configOf } from "./reducer.ts";
import type { DagState } from "./state.ts";

/** Check every invariant the engine must uphold. */
export function invariantViolations(state: DagState): SystemViolation[] {
  const out: SystemViolation[] = [...systemInvariantViolations(abstractSystemState(state), configOf(state))];

  if (state.revision !== state.operationCounter) {
    out.push({ invariant: "RevisionMatchesCounter", detail: `revision ${state.revision} != counter ${state.operationCounter}` });
  }
  if (state.receipts.length !== state.operationCounter) {
    out.push({ invariant: "ReceiptCount", detail: `${state.receipts.length} receipts for ${state.operationCounter} operations` });
  }
  state.receipts.forEach((receipt, index) => {
    if (receipt.revision !== index + 1) {
      out.push({ invariant: "ReceiptContiguous", detail: `receipt ${index} has revision ${receipt.revision}` });
    }
  });

  const nodeSet = new Set(Object.keys(state.nodes));
  const orderSet = new Set(state.order);
  if (orderSet.size !== nodeSet.size || [...orderSet].some((id) => !nodeSet.has(id))) {
    out.push({ invariant: "OrderMatchesNodes", detail: "declaration order is not the declared node set" });
  }
  const position = new Map<string, number>();
  state.order.forEach((id, index) => position.set(id, index));
  for (const id of state.order) {
    for (const dep of state.nodes[id]!.deps) {
      if (!nodeSet.has(dep)) out.push({ invariant: "DependencyDeclared", detail: `${id} depends on undeclared ${dep}` });
      else if ((position.get(dep) ?? -1) >= (position.get(id) ?? -1)) {
        out.push({ invariant: "TopologicalOrder", detail: `${id} precedes dependency ${dep}` });
      }
    }
  }
  return out;
}

/** Names of the production-only invariants. */
export const PRODUCTION_INVARIANT_NAMES: readonly string[] = [
  "RevisionMatchesCounter",
  "ReceiptCount",
  "ReceiptContiguous",
  "OrderMatchesNodes",
  "DependencyDeclared",
  "TopologicalOrder",
];
