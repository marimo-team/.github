import { deepEqual as assertEquals } from "node:assert/strict";
import {
  combineCi,
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
  authority: "approve",
  reviewer: { harness: "claude" },
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
  open: true,
  draft: false,
  headSha: head,
  authorRole: "write",
  files: [{ path: "src/a.ts", changes: 10 }],
  filesTruncated: false,
  ci: "success",
};

function finding(severity: Finding["severity"]): Finding {
  return { path: "src/a.ts", line: 1, side: "RIGHT", severity, title: "t", body: "b" };
}

Deno.test("approves an eligible PR with a clean, complete review", () => {
  assertEquals(evaluate(clean, head, eligible, policy), { kind: "approve" });
});

Deno.test("requests changes for findings at or above the threshold, even when incomplete", () => {
  const result = { ...clean, outcome: "incomplete" as const, findings: [finding("high")] };
  assertEquals(evaluate(result, head, eligible, policy).kind, "request_changes");
});

Deno.test("each approval condition independently prevents approval", () => {
  const cases: [string, ReviewResult, PullState][] = [
    ["incomplete", { ...clean, outcome: "incomplete" }, eligible],
    ["limitations", { ...clean, limitations: ["skipped tests"] }, eligible],
    ["medium finding", { ...clean, findings: [finding("medium")] }, eligible],
    ["closed", clean, { ...eligible, open: false }],
    ["draft", clean, { ...eligible, draft: true }],
    ["head moved", clean, { ...eligible, headSha: "b".repeat(40) }],
    ["ci pending", clean, { ...eligible, ci: "pending" }],
    ["ci missing", clean, { ...eligible, ci: "missing" }],
    ["protected path", clean, {
      ...eligible,
      files: [{ path: ".github/workflows/x.yml", changes: 1 }],
    }],
    [
      "renamed out of protected path",
      clean,
      { ...eligible, files: [{ path: "x.yml", previousPath: ".github/x.yml", changes: 1 }] },
    ],
    ["truncated files", clean, { ...eligible, filesTruncated: true }],
    ["too large", clean, { ...eligible, files: [{ path: "src/a.ts", changes: 101 }] }],
    ["author role", clean, { ...eligible, authorRole: "triage" }],
  ];
  for (const [name, result, pull] of cases) {
    const verdict = evaluate(result, head, pull, policy);
    assertEquals(verdict.kind, "comment", name);
    assertEquals(verdict.kind === "comment" && verdict.reasons.length, 1, name);
  }
});

Deno.test("low findings don't prevent approval", () => {
  assertEquals(evaluate({ ...clean, findings: [finding("low")] }, head, eligible, policy), {
    kind: "approve",
  });
});

Deno.test("authority limits what a verdict can do on GitHub", () => {
  const approve: Verdict = { kind: "approve" };
  const block: Verdict = { kind: "request_changes", blocking: [finding("high")] };
  const comment: Verdict = { kind: "comment", reasons: ["x"] };
  const table = {
    advisory: [
      reviewEvent(approve, "advisory"),
      reviewEvent(block, "advisory"),
      reviewEvent(comment, "advisory"),
    ],
    block: [
      reviewEvent(approve, "block"),
      reviewEvent(block, "block"),
      reviewEvent(comment, "block"),
    ],
    approve: [
      reviewEvent(approve, "approve"),
      reviewEvent(block, "approve"),
      reviewEvent(comment, "approve"),
    ],
  };
  assertEquals(table, {
    advisory: ["COMMENT", "COMMENT", "COMMENT"],
    block: ["COMMENT", "REQUEST_CHANGES", "COMMENT"],
    approve: ["APPROVE", "REQUEST_CHANGES", "COMMENT"],
  });
});

Deno.test("withdraws earlier approvals and lifts blocks only after a full review of the head", () => {
  const earlier = [{ id: 1, state: "APPROVED" }, { id: 2, state: "CHANGES_REQUESTED" }];
  const comment: Verdict = { kind: "comment", reasons: ["x"] };
  const base = {
    result: clean,
    verdict: comment,
    event: "COMMENT" as const,
    authority: "block" as const,
    reviewedHeadSha: head,
    pull: eligible,
  };
  assertEquals(supersededReviews(earlier, base), [1, 2]);
  assertEquals(
    supersededReviews(earlier, { ...base, event: "APPROVE", verdict: { kind: "approve" } }),
    [2],
  );
  for (
    const degraded of [
      { result: { ...clean, outcome: "incomplete" as const } },
      { result: { ...clean, limitations: ["Skipped a file."] } },
      { pull: { ...eligible, filesTruncated: true } },
      { pull: { ...eligible, headSha: "b".repeat(40) } },
      { verdict: { kind: "request_changes" as const, blocking: [] } },
      { authority: "advisory" as const },
    ]
  ) {
    assertEquals(
      supersededReviews(earlier, { ...base, ...degraded }),
      [1],
      JSON.stringify(degraded),
    );
  }
});

Deno.test("combines check runs and commit statuses", () => {
  const done = (conclusion: string) => ({ status: "completed", conclusion, details_url: null });
  const running = { status: "in_progress", conclusion: null, details_url: null };
  const noStatus = { state: "pending", totalCount: 0 };
  const ci = (runs: Parameters<typeof combineCi>[0], status = noStatus) =>
    combineCi(runs, status, "7");
  assertEquals(ci([]), "missing");
  assertEquals(ci([done("success"), done("skipped")]), "success");
  assertEquals(ci([done("success"), running]), "pending");
  assertEquals(ci([done("cancelled")]), "failure");
  assertEquals(ci([done("success")], { state: "pending", totalCount: 1 }), "pending");
  assertEquals(ci([], { state: "failure", totalCount: 1 }), "failure");
  assertEquals(ci([], { state: "success", totalCount: 2 }), "success");
});

Deno.test("ignores this run's own jobs when combining CI", () => {
  const ownJob = {
    status: "in_progress",
    conclusion: null,
    details_url: "https://github.com/o/r/actions/runs/7/job/9",
  };
  const otherRun = { ...ownJob, details_url: "https://github.com/o/r/actions/runs/70/job/9" };
  const noStatus = { state: "pending", totalCount: 0 };
  assertEquals(combineCi([ownJob], noStatus, "7"), "missing");
  assertEquals(combineCi([ownJob, otherRun], noStatus, "7"), "pending");
});
