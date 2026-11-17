import { deepEqual as assertEquals } from "node:assert/strict";
import { reviewBody } from "./messages.ts";

Deno.test("review body distinguishes proposed from enforced decisions", () => {
  const result = {
    outcome: "completed" as const,
    summary: "s",
    coverage: "c",
    limitations: [],
    findings: [],
  };
  const run = {
    harness: "claude" as const,
    requester: "maintainer",
    runUrl: "https://x",
    headSha: "a".repeat(40),
  };
  const options = { run, result, unanchored: [], notes: [] };
  const verdict = { kind: "comment" as const, reasons: ["Changes `![x](https://evil.test)`."] };

  const comment = reviewBody({ ...options, verdict, event: "COMMENT" });
  assertEquals(comment.includes("**Decision: Comment**"), true);
  assertEquals(comment.includes("https://evil.test") && !comment.includes("!["), true);

  const proposed = reviewBody({
    ...options,
    verdict: { kind: "approve" },
    event: "COMMENT",
  });
  assertEquals(proposed.includes("**Proposed decision: Approve** (this repository doesn't"), true);
});

Deno.test("caps the review body below GitHub's limit and keeps the footer", () => {
  const long = "x".repeat(7_000);
  const finding = {
    path: "a.ts",
    line: 1,
    side: "RIGHT" as const,
    severity: "low" as const,
    title: "t",
    body: long,
  };
  const body = reviewBody({
    run: { harness: "claude", requester: "m", runUrl: "https://x", headSha: "a".repeat(40) },
    result: { outcome: "completed", summary: long, coverage: long, limitations: [], findings: [] },
    verdict: { kind: "comment", reasons: [] },
    event: "COMMENT",
    unanchored: Array(30).fill(finding),
    notes: [],
  });
  assertEquals(body.length < 65_536, true);
  assertEquals(body.endsWith("[Run](https://x)"), true);
});
