import { deepEqual, doesNotMatch, match, ok } from "node:assert/strict";
import { reviewBody } from "./messages.ts";
import type { Finding, ReviewResult } from "./result.ts";

const run = {
  model: "claude-opus-5-5",
  requester: "maintainer",
  runUrl: "https://x",
  headSha: "a".repeat(40),
};
const result: ReviewResult = {
  outcome: "completed",
  summary: "s",
  coverage: "c",
  limitations: [],
  findings: [],
};

Deno.test("review body distinguishes proposed from enforced decisions", () => {
  const options = { run, result, unanchored: [], notes: [] };
  const verdict = { kind: "comment" as const, reasons: ["Changes `![x](https://evil.test)`."] };

  const comment = reviewBody({ ...options, verdict, event: "COMMENT" });
  match(comment, /\*\*Decision: Comment\*\*/);
  doesNotMatch(comment, /!\[/);

  const proposed = reviewBody({ ...options, verdict: { kind: "approve" }, event: "COMMENT" });
  match(proposed, /\*\*Proposed decision: Approve\*\* \(this repository doesn't/);
});

Deno.test("drops coverage before findings when the body is too long", () => {
  const long = "x".repeat(7_000);
  const finding: Finding = {
    path: "a.ts",
    line: 1,
    side: "RIGHT",
    severity: "low",
    title: "t",
    body: "b".repeat(1_500),
  };
  const body = reviewBody({
    run,
    result: { ...result, coverage: long, limitations: Array(30).fill(long), findings: [finding] },
    verdict: { kind: "comment", reasons: [] },
    event: "COMMENT",
    unanchored: Array(30).fill(finding),
    notes: [],
  });
  ok(body.length < 65_536);
  match(body, /\*\*Findings outside the diff\*\*/);
  doesNotMatch(body, /<details>/);
  match(body, /too long to post in full/);
  ok(body.endsWith("[Run](https://x)"));
});

Deno.test("caps a body whose findings alone are too long, keeping the footer", () => {
  const finding: Finding = {
    path: "a.ts",
    line: 1,
    side: "RIGHT",
    severity: "low",
    title: "t",
    body: "b".repeat(4_000),
  };
  const body = reviewBody({
    run,
    result: { ...result, summary: "s".repeat(8_000), findings: [finding] },
    verdict: { kind: "comment", reasons: [] },
    event: "COMMENT",
    unanchored: Array(30).fill(finding),
    notes: [],
  });
  ok(body.length < 65_536);
  deepEqual(body.endsWith("[Run](https://x)"), true);
});
