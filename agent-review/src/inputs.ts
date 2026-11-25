import { requireEnv, requireSha } from "./actions.ts";
import type { RunInfo } from "./messages.ts";
import { parsePolicy, type RepoPolicy } from "./policy.ts";

export function policyFromEnv(): RepoPolicy {
  return parsePolicy({ model: Deno.env.get("POLICY_MODEL") ?? "" });
}

export function runInfoFromEnv(): RunInfo {
  return {
    model: policyFromEnv().model,
    requester: requireEnv("REQUESTER"),
    runUrl: requireEnv("RUN_URL"),
    headSha: requireSha("HEAD_SHA"),
  };
}
