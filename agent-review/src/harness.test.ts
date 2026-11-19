import { deepEqual as assertEquals } from "node:assert/strict";
import { claudeArgs } from "./harness.ts";
import { reviewResultSchema } from "./result.ts";

Deno.test("the schema meets OpenAI strict-mode rules: every property required, none extra", () => {
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

Deno.test("the schema fits in single-quoted Claude arguments", () => {
  claudeArgs(undefined, reviewResultSchema);
});
