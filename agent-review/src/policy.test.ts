import { deepEqual, throws } from "node:assert/strict";
import { parsePolicy } from "./policy.ts";

Deno.test("uses the default model unless one is given", () => {
  deepEqual(parsePolicy({ model: "" }).model, "claude-opus-5-5");
  deepEqual(parsePolicy({ model: " claude-sonnet-5-5 " }).model, "claude-sonnet-5-5");
});

Deno.test("rejects a model that would add command-line flags", () => {
  throws(() => parsePolicy({ model: "opus --max-turns 1" }), /model/);
});
