import { deepEqual, match } from "node:assert/strict";
import { planReview } from "./plan.ts";
import type { Finding, ReviewResult } from "./result.ts";

const head = "a".repeat(40);
const run = {
  model: "claude-opus-5-5",
  requester: "maintainer",
  runUrl: "https://x",
  headSha: head,
};
const inDiff: Finding = {
  path: "a.py",
  line: 1,
  side: "RIGHT",
  severity: "high",
  title: "in diff",
  body: "b",
};
const outsideDiff: Finding = { ...inDiff, line: 99, title: "outside diff" };
const result: ReviewResult = {
  outcome: "completed",
  summary: "s",
  coverage: "c",
  limitations: [],
  findings: [inDiff, outsideDiff],
};
const patches = new Map([["a.py", "@@ -0,0 +1,2 @@\n+x\n+y"]]);

Deno.test("comments inline where it can, with the rest in the body and a body-only fallback", () => {
  const plan = planReview({ result, run, pull: { headSha: head }, patches });
  deepEqual(plan.review.commit_id, head);
  deepEqual(plan.review.event, "COMMENT");
  deepEqual(plan.review.comments.map((comment) => comment.line), [1]);
  match(plan.review.body, /outside diff/);
  deepEqual(plan.fallback?.comments, []);
  match(plan.fallback?.body ?? "", /in diff[\s\S]*outside diff/);
});

Deno.test("reviews a moved head in the body only, without a commit", () => {
  const plan = planReview({ result, run, pull: { headSha: "b".repeat(40) }, patches });
  deepEqual(plan.review.commit_id, undefined);
  deepEqual(plan.review.comments, []);
  deepEqual(plan.fallback, undefined);
  match(plan.review.body, /Newer commits exist/);
});
