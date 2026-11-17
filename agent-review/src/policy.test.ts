import { deepEqual as assertEquals, throws as assertThrows } from "node:assert/strict";
import { parsePolicy, type PolicyInputs } from "./policy.ts";

const inputs: PolicyInputs = {
  authority: "advisory",
  harness: "claude",
  model: "",
  blockAtSeverity: "high",
  neverAutoApprove: "",
  maxChangedLines: "400",
};

Deno.test("uses the harness's default model unless one is given", () => {
  assertEquals(parsePolicy(inputs).reviewer, { harness: "claude", model: "claude-opus-5-5" });
  assertEquals(parsePolicy({ ...inputs, harness: "codex" }).reviewer, {
    harness: "codex",
    model: undefined,
  });
  assertEquals(parsePolicy({ ...inputs, model: " gpt-5 " }).reviewer.model, "gpt-5");
});

Deno.test("adds a repository's paths to the defaults rather than replacing them", () => {
  const paths = parsePolicy({ ...inputs, neverAutoApprove: "marimo/_ast/**\n\n  src/** \n" })
    .neverAutoApprove;
  assertEquals(paths.includes(".github/**"), true);
  assertEquals(paths.slice(-2), ["marimo/_ast/**", "src/**"]);
});

Deno.test("rejects invalid inputs", () => {
  assertThrows(() => parsePolicy({ ...inputs, authority: "merge" }), /authority/);
  assertThrows(() => parsePolicy({ ...inputs, harness: "" }), /harness/);
  assertThrows(() => parsePolicy({ ...inputs, blockAtSeverity: "High" }), /block-at-severity/);
  assertThrows(() => parsePolicy({ ...inputs, maxChangedLines: "1.5" }), /max-changed-lines/);
});
