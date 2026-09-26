// Generator for spec/DagSystemProof.tla, mirroring the established
// structure: Init => Inv, then one case per action with one step per component.
import { writeFileSync } from "node:fs";

const COMPONENTS = [
  "TypeOK",
  "CoreInv",
  "GitInv",
  "CouplingInv",
  "FileOwnership",
  "UndeclaredFree",
  "DepsIntegratedBeyondPending",
  "SuspendedHasWorktree",
  "DispatchedDeclared",
  "MergingExcludesIntegrated",
];

const INVARIANT_DEFS = [
  "CoreInv",
  "GitInv",
  "CouplingInv",
  "FileOwnership",
  "UndeclaredFree",
  "DepsIntegratedBeyondPending",
  "SuspendedHasWorktree",
  "DispatchedDeclared",
  "MergingExcludesIntegrated",
];

// Node actions in `Next` order: [case title, extra DEF names]
const NODE_ACTIONS = [
  ["Declare", ["Declare", "DeclareWith", "GuardDeclare"]],
  ["Adopt", ["Adopt", "AdoptWith", "GuardAdopt"]],
  ["Orphan", ["Orphan", "GuardOrphan"]],
  ["Amend", ["Amend", "AmendWith", "GuardAmend"]],
  ["MarkStale", ["MarkStale", "GuardMarkStale"]],
  ["Reset", ["Reset", "GuardReset"]],
  ["Park", ["Park", "GuardPark"]],
  ["Unpark", ["Unpark", "GuardUnpark"]],
  ["Dispatch", ["Dispatch", "CanDispatch"]],
  ["FinishWorktree", ["FinishWorktree", "GuardFinish"]],
  ["Admit", ["Admit", "GuardAdmit"]],
  ["CheckFiles", ["CheckFiles", "GuardCheckFiles"]],
  ["Complete", ["Complete", "CanSettle"]],
  ["Block", ["Block", "CanSettle"]],
  ["Underspecify", ["Underspecify", "CanSettle"]],
  ["Fail", ["Fail", "CanSettle"]],
  ["EffectStale", ["EffectStale", "GuardStale"]],
  ["Resume", ["Resume", "GuardResume"]],
  ["Steer", ["Steer", "GuardSteer"]],
  ["Stop", ["Stop", "GuardStop"]],
  ["BeginMerge", ["BeginMerge", "GuardBegin"]],
  ["CommitMerge", ["CommitMerge", "GuardCommit"]],
  ["MergeConflict", ["MergeConflict", "GuardConflict"]],
  ["ResolveConflict", ["ResolveConflict", "GuardResolve"]],
  ["Remove", ["Remove", "GuardRemove"]],
  ["Reconcile", ["Reconcile", "GuardReconcile"]],
];

// Non-node cases: [prefix, extra DEF names]
const OTHER_ACTIONS = [
  ["Inv /\\ Crash", ["Crash"]],
  ["Inv /\\ Reopen", ["Reopen"]],
  ["Inv /\\ UNCHANGED vars", ["vars"]],
];

const lines = [];
const push = (s = "") => lines.push(s);

push("------------------------ MODULE DagSystemProof ------------------------");
push("\\* The inductive safety proof for the parameterized DagSystem.");
push("\\*");
push("\\* Unlike the TLC fixture (two nodes, one edge, bounded generations), this");
push("\\* module proves `Spec => []Inv` for EVERY value of the constants. Each action");
push("\\* is proved to preserve each invariant component; no step appeals to");
push("\\* finiteness, so `[]Inv` holds for arbitrary N.");
push("\\*");
push("\\* Generated from the action/component list; keep in step with DagSystem.tla.");
push("\\* Run with tlapm (see scripts/tlapm.mjs and PROOF-NOTES.md).");
push("\\* ---------------------------------------------------------------------");
push();
push("EXTENDS DagSystem, TLAPS");
push();
push("\\* `0..MaxGen` and `0..MaxDropped` are only well-founded for natural bounds;");
push("\\* the TLC fixture made this implicit by instantiating numerals.");
push("THEOREM Safety ==");
push("  ASSUME MaxGen \\in Nat, MaxDropped \\in Nat");
push("  PROVE Spec => []Inv");
push();

// <1>1 Init => Inv
push("  <1>1. Init => Inv");
COMPONENTS.forEach((component, index) => {
  push(`    <2>${index + 1}. Init => ${component}`);
  push(`      BY DEF Status, GState, Init, ${component}, Deps`);
});
push(`    <2>${COMPONENTS.length + 1}. QED`);
push(`      BY ${COMPONENTS.map((_, i) => `<2>${i + 1}`).join(", ")} DEF Inv`);
push();

// <1>2 Inv /\ [Next]_vars => Inv'
push("  <1>2. Inv /\\ [Next]_vars => Inv'");
let caseNo = 0;
const caseRefs = [];
function emitCase(prefix, extraDefs) {
  caseNo += 1;
  caseRefs.push(caseNo);
  push(`    <2>${caseNo}. ${prefix} => Inv'`);
  COMPONENTS.forEach((component, index) => {
    const defs =
      component === "TypeOK"
        ? ["Status", "GState", "Inv", "TypeOK", ...extraDefs, "Deps"]
        : ["Status", "GState", "Inv", "TypeOK", ...INVARIANT_DEFS, ...extraDefs, "Deps"];
    push(`      <3>${index + 1}. ${prefix} => ${component}'`);
    push(`        BY DEF ${defs.join(", ")}`);
  });
  push(`      <3>${COMPONENTS.length + 1}. QED`);
  push(`        BY ${COMPONENTS.map((_, i) => `<3>${i + 1}`).join(", ")} DEF Inv`);
}

for (const [title, defs] of NODE_ACTIONS) {
  emitCase(`\\A n \\in Nodes: Inv /\\ ${title}(n)`, defs);
}
for (const [prefix, defs] of OTHER_ACTIONS) {
  emitCase(prefix, defs);
}

push(`    <2>${caseNo + 1}. QED`);
push(`      BY ${caseRefs.map((n) => `<2>${n}`).join(", ")}`);
push("         DEF Next, vars");
push();

push("  <1>3. QED");
push("    BY <1>1, <1>2, PTL DEF Spec");
push();
push("=========================================================================");
push("");

writeFileSync(process.argv[2], lines.join("\n"), "utf8");
console.log(`wrote ${process.argv[2]} (${caseNo} action cases)`);
