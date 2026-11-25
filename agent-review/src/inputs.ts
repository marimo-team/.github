import { requireEnv, requireSha } from "./actions.ts";
import type { RunInfo } from "./messages.ts";
import { parsePolicy, type RepoPolicy } from "./policy.ts";

export function policyFromEnv(): RepoPolicy {
  const input = (name: string) => Deno.env.get(`POLICY_${name}`) ?? "";
  return parsePolicy({
    allowApprove: input("ALLOW_APPROVE"),
    model: input("MODEL"),
    blockAtSeverity: input("BLOCK_AT_SEVERITY"),
    neverAutoApprove: input("NEVER_AUTO_APPROVE"),
    maxChangedLines: input("MAX_CHANGED_LINES"),
  });
}

export function runInfoFromEnv(): RunInfo {
  return {
    model: policyFromEnv().model,
    requester: requireEnv("REQUESTER"),
    runUrl: requireEnv("RUN_URL"),
    headSha: requireSha("HEAD_SHA"),
  };
}
