import { deepEqual as assertEquals } from "node:assert/strict";
import type { ReviewResult } from "./result.ts";
import { applyVerification, type FindingCheck, parseVerification } from "./verification.ts";

const check = (index: number, confirmed = true): FindingCheck => ({
  index,
  confirmed,
  severity: "low",
  reason: "r",
});

function errorsFor(checks: unknown, count: number): readonly string[] {
  const parsed = parseVerification(JSON.stringify({ checks }), count);
  return parsed.ok ? [] : parsed.errors;
}

Deno.test("requires exactly one check per candidate", () => {
  assertEquals(errorsFor([check(1), check(0)], 2), []);
  assertEquals(errorsFor([check(0)], 2).length, 1);
  assertEquals(errorsFor([check(0), check(0)], 2).length > 0, true);
  assertEquals(errorsFor([check(0), check(1), check(2)], 2).length > 0, true);
  assertEquals(errorsFor([{ ...check(0), confirmed: "yes" }], 1).length, 1);
  assertEquals(parseVerification("[]", 1).ok, false);
});

Deno.test("keeps confirmed findings at the verified severity", () => {
  const finding = { path: "a.ts", line: 1, side: "RIGHT", title: "t", body: "b" } as const;
  const result: ReviewResult = {
    outcome: "completed",
    summary: "s",
    coverage: "c",
    limitations: [],
    findings: [
      { ...finding, severity: "high", title: "kept" },
      { ...finding, severity: "critical", title: "dropped" },
    ],
  };
  const verified = applyVerification(result, [check(0), check(1, false)]);
  assertEquals(verified.rejected, 1);
  assertEquals(verified.result.findings.map((f) => [f.title, f.severity]), [["kept", "low"]]);
});
