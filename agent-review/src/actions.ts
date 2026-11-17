import type { RunInfo } from "./messages.ts";
import { parsePolicy, type RepoPolicy } from "./policy.ts";

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export function requireSha(name: string): string {
  const value = requireEnv(name);
  if (!/^[0-9a-f]{40}$/.test(value)) throw new Error(`${name} must be a commit SHA`);
  return value;
}

export function requirePositiveInteger(name: string): number {
  const value = Number(requireEnv(name));
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

export async function setOutput(name: string, value: string): Promise<void> {
  const delimiter = `EOF_${crypto.randomUUID()}`;
  await Deno.writeTextFile(
    requireEnv("GITHUB_OUTPUT"),
    `${name}<<${delimiter}\n${value}\n${delimiter}\n`,
    {
      append: true,
    },
  );
}

export function warning(message: string): void {
  console.log(`::warning::${message.replace(/\r?\n/g, " ")}`);
}

export async function runMain(main: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (error) {
    console.log(`::error::${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}

export function runInfoFromEnv(): RunInfo {
  const { harness, model } = policyFromEnv().reviewer;
  return {
    harness,
    model,
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
