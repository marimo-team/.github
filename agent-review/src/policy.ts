export const severities = ["low", "medium", "high", "critical"] as const;
export type Severity = (typeof severities)[number];

export const repositoryRoles = ["none", "read", "triage", "write", "maintain", "admin"] as const;
export type RepositoryRole = (typeof repositoryRoles)[number];

export interface RepoPolicy {
  readonly model: string;
}

export const reviewLabel = "agent-review";
export const botLogin = "marimo-oss-bot[bot]";
export const minimumRequesterRole: RepositoryRole = "write";

const defaultModel = "claude-opus-5-5";

/**
 * The caller workflow's inputs, as strings. The caller workflow runs from the default
 * branch, so a PR can't change the policy it's reviewed under.
 */
export interface PolicyInputs {
  readonly model: string;
}

/** The model is passed in Claude's command-line arguments, so it can't carry other flags. */
function parseModel(input: string): string {
  const model = input.trim() || defaultModel;
  if (!/^[\w.:@/-]+$/.test(model)) throw new Error(`model has unexpected characters: "${model}"`);
  return model;
}

export function parsePolicy(inputs: PolicyInputs): RepoPolicy {
  return { model: parseModel(inputs.model) };
}

export function atLeastRole(role: RepositoryRole, minimum: RepositoryRole): boolean {
  return repositoryRoles.indexOf(role) >= repositoryRoles.indexOf(minimum);
}
