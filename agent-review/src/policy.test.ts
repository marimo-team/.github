import { deepEqual, ok, throws } from "node:assert/strict";
import { parsePolicy, type PolicyInputs } from "./policy.ts";

const inputs: PolicyInputs = {
  allowApprove: "false",
  model: "",
  blockAtSeverity: "high",
  neverAutoApprove: "",
  maxChangedLines: "400",
};

Deno.test("uses the default model unless one is given", () => {
  deepEqual(parsePolicy(inputs).model, "claude-opus-5-5");
  deepEqual(parsePolicy({ ...inputs, model: " claude-sonnet-5-5 " }).model, "claude-sonnet-5-5");
});

Deno.test("adds a repository's paths to the defaults rather than replacing them", () => {
  const paths = parsePolicy({ ...inputs, neverAutoApprove: "marimo/_ast/**\n\n  src/** \n" })
    .neverAutoApprove;
  ok(paths.includes(".github/**"));
  deepEqual(paths.slice(-2), ["marimo/_ast/**", "src/**"]);
});

Deno.test("rejects invalid inputs", () => {
  throws(() => parsePolicy({ ...inputs, allowApprove: "yes" }), /allow-approve/);
  throws(() => parsePolicy({ ...inputs, model: "opus --max-turns 1" }), /model/);
  throws(() => parsePolicy({ ...inputs, blockAtSeverity: "High" }), /block-at-severity/);
  throws(() => parsePolicy({ ...inputs, maxChangedLines: "1.5" }), /max-changed-lines/);
});
