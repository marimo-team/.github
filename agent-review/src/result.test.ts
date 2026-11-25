import { deepEqual, ok } from "node:assert/strict";
import { headPathNormalizer, parseReviewResult, reviewResultSchema } from "./result.ts";

const finding = {
  path: "src/a.py",
  line: 3,
  side: "RIGHT",
  severity: "high",
  title: "t",
  body: "b",
};
const valid = {
  outcome: "completed",
  summary: "s",
  coverage: "c",
  limitations: [],
  findings: [finding],
};

function parse(value: unknown) {
  const parsed = parseReviewResult(JSON.stringify(value));
  if (!parsed.ok) throw new Error(parsed.errors.join("; "));
  return parsed.value;
}

function errorsFor(value: unknown): readonly string[] {
  const parsed = parseReviewResult(JSON.stringify(value));
  return parsed.ok ? [] : parsed.errors;
}

Deno.test("parses a valid result", () => {
  deepEqual(parse(valid).findings, [finding]);
});

Deno.test("rejects malformed output with errors that say where", () => {
  deepEqual(parseReviewResult("not json").ok, false);
  deepEqual(errorsFor([]), ["output must be a JSON object"]);
  deepEqual(errorsFor({ ...valid, outcome: "done" }), [
    "result.outcome must be one of completed, incomplete",
  ]);
  deepEqual(errorsFor({ ...valid, summary: " " }), ["result.summary must be a non-empty string"]);
  deepEqual(errorsFor({ ...valid, findings: [{ ...finding, line: "3" }] }), [
    "result.findings[0].line must be an integer of at least 1",
  ]);
  deepEqual(errorsFor({ ...valid, findings: [7] }), ["result.findings[0] must be an object"]);
  deepEqual(errorsFor({ ...valid, limitations: [1] }), [
    "result.limitations[0] must be a non-empty string",
  ]);
  deepEqual(errorsFor({ ...valid, findings: Array(501).fill(finding) }), [
    "result.findings has more than 500 items",
  ]);
});

Deno.test("keeps the most severe findings in their original order and truncates titles", () => {
  const low = { ...finding, severity: "low" };
  const findings = [
    { ...low, line: 1 },
    { ...finding, line: 2 },
    ...Array(29).fill(low).map((item, index) => ({ ...item, line: index + 10 })),
    { ...finding, line: 3, title: "x".repeat(500) },
  ];
  const result = parse({ ...valid, findings });
  deepEqual(result.findings.length, 30);
  deepEqual(result.findings.slice(0, 3).map((item) => item.line), [1, 2, 10]);
  deepEqual(result.findings.at(-1)?.title, `${"x".repeat(199)}…`);
  deepEqual(result.limitations, ["2 lower-severity findings were omitted."]);
});

Deno.test("parsing its own output again keeps the omitted-findings note", () => {
  const limitations = Array.from({ length: 30 }, (_, index) => `limitation ${index}`);
  const once = parse({ ...valid, limitations, findings: Array(31).fill(finding) });
  const twice = parse(once);
  deepEqual(twice, once);
  deepEqual(twice.limitations.at(-1), "1 lower-severity findings were omitted.");
  deepEqual(twice.limitations.length, 30);
});

Deno.test("normalizes paths agents write relative to where they read", () => {
  const normalize = headPathNormalizer("/home/runner/work/r/r", "pr-head");
  for (
    const path of ["./pr-head/src/a.py", "/home/runner/work/r/r/pr-head/src/a.py", "src/a.py"]
  ) {
    const parsed = parseReviewResult(
      JSON.stringify({ ...valid, findings: [{ ...finding, path }] }),
      normalize,
    );
    deepEqual(parsed.ok && parsed.value.findings[0]?.path, "src/a.py", path);
  }
});

Deno.test("rejects findings that point outside the repository", () => {
  for (
    const path of ["/etc/passwd", "../x", "a/./b", "a//b", "a\\b", "a\u0000b", "a".repeat(501)]
  ) {
    ok(errorsFor({ ...valid, findings: [{ ...finding, path }] }).length > 0, path);
  }
  deepEqual(errorsFor({ ...valid, findings: [{ ...finding, line: 0 }] }).length, 1);
});

Deno.test("the schema fits in single-quoted Claude arguments", () => {
  ok(!JSON.stringify(reviewResultSchema).includes("'"));
});
