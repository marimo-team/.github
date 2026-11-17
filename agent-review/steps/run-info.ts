import { requireEnv, requireSha } from "../src/actions.ts";
import type { RunInfo } from "../src/messages.ts";
import type { Harness } from "../src/policy.ts";

const harnesses: readonly Harness[] = ["claude", "codex"];

export function runInfoFromEnv(): RunInfo {
  const harness = harnesses.find((value) => value === requireEnv("HARNESS"));
  if (!harness) throw new Error("HARNESS must be claude or codex");
  return {
    harness,
    model: Deno.env.get("MODEL") || undefined,
    requester: requireEnv("REQUESTER"),
    runUrl: requireEnv("RUN_URL"),
    headSha: requireSha("HEAD_SHA"),
  };
}
