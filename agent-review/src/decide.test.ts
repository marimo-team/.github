import { deepEqual } from "node:assert/strict";
import {
  type EarlierReview,
  evaluate,
  type PullState,
  reviewEvent,
  supersededReviews,
  type Verdict,
} from "./decide.ts";
import type { RepoPolicy } from "./policy.ts";
import type { Finding, ReviewResult } from "./result.ts";

const head = "a".repeat(40);

const policy: RepoPolicy = {
  allowApprove: true,
  model: "claude-opus-5-5",
  blockAtSeverity: "high",
  neverAutoApprove: [".github/**"],
  maxChangedLines: 100,
  minimumAuthorRole: "write",
};

const clean: ReviewResult = {
  outcome: "completed",
  summary: "Adds a helper.",
  coverage: "All files.",
  limitations: [],
  findings: [],
};

const eligible: PullState = {
  headSha: head,
  authorRole: "write",
  files: [{ path: "src/a.ts", changes: 10 }],
  coverageGaps: [],
};

function finding(severity: Finding["severity"]): Finding {
  return { path: "src/a.ts", line: 1, side: "RIGHT", severity, title: "t", body: "b" };
}

Deno.test("approves an eligible PR with a clean, complete review", () => {
  deepEqual(evaluate(clean, head, eligible, policy), { kind: "approve" });
});

Deno.test("requests changes for findings at or above the threshold, even when incomplete", () => {
  const result = { ...clean, outcome: "incomplete" as const, findings: [finding("high")] };
  deepEqual(evaluate(result, head, eligible, policy).kind, "request_changes");
});

Deno.test("findings below a raised threshold comment instead of blocking", () => {
  const verdict = evaluate(
    { ...clean, findings: [finding("high")] },
    head,
    eligible,
    { ...policy, blockAtSeverity: "critical" },
  );
  deepEqual(verdict, { kind: "comment", reasons: ["1 finding(s) at medium severity or above."] });
});

Deno.test("each approval condition independently prevents approval", () => {
  const cases: [string, ReviewResult, PullState][] = [
    ["incomplete", { ...clean, outcome: "incomplete" }, eligible],
    ["limitations", { ...clean, limitations: ["skipped tests"] }, eligible],
    ["coverage gap", clean, { ...eligible, coverageGaps: ["The diff is too large."] }],
    ["medium finding", { ...clean, findings: [finding("medium")] }, eligible],
    ["head moved", clean, { ...eligible, headSha: "b".repeat(40) }],
    ["protected path", clean, {
      ...eligible,
      files: [{ path: ".github/workflows/x.yml", changes: 1 }],
    }],
    [
      "renamed out of protected path",
      clean,
      { ...eligible, files: [{ path: "x.yml", previousPath: ".github/x.yml", changes: 1 }] },
    ],
    ["too large", clean, { ...eligible, files: [{ path: "src/a.ts", changes: 101 }] }],
    ["author role", clean, { ...eligible, authorRole: "triage" }],
  ];
  for (const [name, result, pull] of cases) {
    const verdict = evaluate(result, head, pull, policy);
    deepEqual(verdict.kind === "comment" && verdict.reasons.length, 1, name);
  }
});

Deno.test("approves at exactly the line limit, and with low findings", () => {
  const atLimit = { ...eligible, files: [{ path: "src/a.ts", changes: 100 }] };
  deepEqual(evaluate(clean, head, atLimit, policy), { kind: "approve" });
  deepEqual(evaluate({ ...clean, findings: [finding("low")] }, head, eligible, policy), {
    kind: "approve",
  });
});

Deno.test("approves only when the repository allows it", () => {
  const approve: Verdict = { kind: "approve" };
  const block: Verdict = { kind: "request_changes", blocking: [finding("high")] };
  const comment: Verdict = { kind: "comment", reasons: ["x"] };
  const events = (allowApprove: boolean) =>
    [approve, block, comment].map((verdict) => reviewEvent(verdict, allowApprove));
  deepEqual(events(true), ["APPROVE", "REQUEST_CHANGES", "COMMENT"]);
  deepEqual(events(false), ["COMMENT", "REQUEST_CHANGES", "COMMENT"]);
});

Deno.test("withdraws earlier approvals and lifts blocks only after a full review of the head", () => {
  const earlier: EarlierReview[] = [
    { id: 1, state: "APPROVED" },
    { id: 2, state: "CHANGES_REQUESTED" },
    { id: 3, state: "COMMENTED" },
    { id: 4, state: "DISMISSED" },
  ];
  const base = { result: clean, event: "COMMENT" as const, reviewedHeadSha: head, pull: eligible };
  deepEqual(supersededReviews(earlier, base), [1, 2]);
  deepEqual(supersededReviews(earlier, { ...base, event: "APPROVE" }), [2]);
  for (
    const degraded of [
      { result: { ...clean, outcome: "incomplete" as const } },
      { result: { ...clean, limitations: ["Skipped a file."] } },
      { pull: { ...eligible, coverageGaps: ["The diff is too large."] } },
      { pull: { ...eligible, headSha: "b".repeat(40) } },
      { event: "REQUEST_CHANGES" as const },
    ]
  ) {
    deepEqual(supersededReviews(earlier, { ...base, ...degraded }), [1], JSON.stringify(degraded));
  }
});
