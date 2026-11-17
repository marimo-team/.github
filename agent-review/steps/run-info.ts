import { requireEnv, requireSha } from "../src/actions.ts";
import type { RunInfo } from "../src/messages.ts";
import { harnesses, parsePolicy, type RepoPolicy } from "../src/policy.ts";

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

export function policyFromEnv(): RepoPolicy {
  const input = (name: string) => Deno.env.get(`POLICY_${name}`) ?? "";
  return parsePolicy({
    allowApprove: input("ALLOW_APPROVE"),
    harness: input("HARNESS"),
    model: input("MODEL"),
    blockAtSeverity: input("BLOCK_AT_SEVERITY"),
    neverAutoApprove: input("NEVER_AUTO_APPROVE"),
    maxChangedLines: input("MAX_CHANGED_LINES"),
  });
}
