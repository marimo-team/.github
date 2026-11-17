import { deepEqual as assertEquals } from "node:assert/strict";
import { parseReviewResult, reviewResultSchema } from "./result.ts";

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
  assertEquals(parsed.ok && parsed.result.findings[0]?.severity, "high");
});

Deno.test("rejects malformed output", () => {
  assertEquals(parseReviewResult("not json").ok, false);
  assertEquals(errorsFor([]).length, 1);
  assertEquals(errorsFor({ ...valid, outcome: "done" }).length, 1);
  assertEquals(errorsFor({ ...valid, summary: " " }).length, 1);
  assertEquals(errorsFor({ ...valid, findings: Array(31).fill(valid.findings[0]) }).length, 1);
});

Deno.test("rejects findings that point outside the repository", () => {
  for (const path of ["/etc/passwd", "../x", "a/./b", "a//b", "a\\b", "a\u0000b"]) {
    const finding = { ...valid.findings[0], path };
    assertEquals(errorsFor({ ...valid, findings: [finding] }).length > 0, true, path);
  }
  const zeroLine = { ...valid.findings[0], line: 0 };
  assertEquals(errorsFor({ ...valid, findings: [zeroLine] }).length, 1);
});

Deno.test("schema meets OpenAI strict-mode rules: every property required, none extra", () => {
  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const schema = node as Record<string, unknown>;
    if (schema.type === "object") {
      assertEquals(schema.additionalProperties, false);
      assertEquals(
        [...(schema.required as string[])].sort(),
        Object.keys(schema.properties as object).sort(),
      );
    }
    Object.values(schema).forEach(visit);
  };
  visit(reviewResultSchema);
});
