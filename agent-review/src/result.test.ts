import { deepEqual as assertEquals } from "node:assert/strict";
import { parseReviewResult, withoutHeadDir } from "./result.ts";

const valid = {
  outcome: "completed",
  summary: "s",
  coverage: "c",
  limitations: [],
  findings: [{ path: "src/a.py", line: 3, side: "RIGHT", severity: "high", title: "t", body: "b" }],
};

function errorsFor(value: unknown): readonly string[] {
  const parsed = parseReviewResult(JSON.stringify(value));
  return parsed.ok ? [] : parsed.errors;
}

Deno.test("parses a valid result", () => {
  const parsed = parseReviewResult(JSON.stringify(valid));
  assertEquals(parsed.ok && parsed.value.findings[0]?.severity, "high");
});

Deno.test("rejects malformed output", () => {
  assertEquals(parseReviewResult("not json").ok, false);
  assertEquals(errorsFor([]).length, 1);
  assertEquals(errorsFor({ ...valid, outcome: "done" }).length, 1);
  assertEquals(errorsFor({ ...valid, summary: " " }).length, 1);
  assertEquals(errorsFor({ ...valid, findings: [{ ...valid.findings[0], line: "3" }] }).length, 1);
});

Deno.test("trims verbose output instead of rejecting it", () => {
  const low = { ...valid.findings[0], severity: "low" };
  const findings = [...Array(30).fill(low), valid.findings[0], { ...low, title: "x".repeat(500) }];
  const parsed = parseReviewResult(JSON.stringify({ ...valid, findings }));
  if (!parsed.ok) throw new Error(parsed.errors.join("; "));
  const kept = parsed.value.findings;
  assertEquals(kept.length, 30);
  assertEquals(kept.filter((finding) => finding.severity === "high").length, 1);
  assertEquals(parsed.value.limitations, ["2 lower-severity findings were omitted."]);
});

Deno.test("normalizes paths agents write relative to where they read", () => {
  const finding = { ...valid.findings[0], path: "./pr-head/src/a.py" };
  const parsed = parseReviewResult(JSON.stringify({ ...valid, findings: [finding] }));
  if (!parsed.ok) throw new Error(parsed.errors.join("; "));
  assertEquals(withoutHeadDir(parsed.value, "pr-head").findings[0]?.path, "src/a.py");
});

Deno.test("rejects findings that point outside the repository", () => {
  for (const path of ["/etc/passwd", "../x", "a/./b", "a//b", "a\\b", "a\u0000b"]) {
    const finding = { ...valid.findings[0], path };
    assertEquals(errorsFor({ ...valid, findings: [finding] }).length > 0, true, path);
  }
  const zeroLine = { ...valid.findings[0], line: 0 };
  assertEquals(errorsFor({ ...valid, findings: [zeroLine] }).length, 1);
});
