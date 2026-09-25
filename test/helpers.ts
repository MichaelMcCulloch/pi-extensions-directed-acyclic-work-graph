import type { NodeDeclaration } from "../src/engine/state.ts";

/** The three-node chain used by the production-store tests. */
export function modelDeclarations(): NodeDeclaration[] {
  return [
    { id: "n1", content: "work for n1", brief: "VALIDATION: tests pass. ACCEPTANCE: merge clean.", deps: [] },
    { id: "n2", content: "work for n2", brief: "VALIDATION: tests pass. ACCEPTANCE: merge clean.", deps: ["n1"] },
    { id: "n3", content: "work for n3", brief: "VALIDATION: tests pass. ACCEPTANCE: merge clean.", deps: ["n2"] },
  ];
}
