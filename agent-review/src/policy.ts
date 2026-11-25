export const severities = ["low", "medium", "high", "critical"] as const;
export type Severity = (typeof severities)[number];

export const repositoryRoles = ["none", "read", "triage", "write", "maintain", "admin"] as const;
export type RepositoryRole = (typeof repositoryRoles)[number];

export interface RepoPolicy {
  /** Without it, the bot only requests changes or comments. */
  readonly allowApprove: boolean;
  readonly model: string;
  /** Findings at or above this severity request changes. */
  readonly blockAtSeverity: Severity;
  /** Globs; a PR touching any of them always needs a human approval. */
  readonly neverAutoApprove: readonly string[];
  readonly maxChangedLines: number;
  readonly minimumAuthorRole: RepositoryRole;
}

export const reviewLabel = "agent-review";
export const botLogin = "marimo-oss-bot[bot]";
export const minimumRequesterRole: RepositoryRole = "write";

const defaultModel = "claude-opus-5-5";

/** Paths every repository needs a human to approve; a repository can add to these. */
const alwaysNeedsHuman = [
  // Workflows, repository review guidance, and agent and editor configuration.
  ".github/**",
  "REVIEW.md",
  "**/AGENTS.md",
  "**/CLAUDE.md",
  "**/.claude/**",
  "**/.codex/**",
  "**/.mcp.json",
  ".vscode/**",
  ".devcontainer/**",
  // Who must review, which code is vendored, and what runs on contributors' machines.
  "**/CODEOWNERS",
  ".gitmodules",
  ".gitattributes",
  ".pre-commit-config.yaml",
  ".husky/**",
  // Dependency changes are supply-chain decisions.
  "**/package.json",
  "**/pnpm-lock.yaml",
  "**/pnpm-workspace.yaml",
  "**/pyproject.toml",
  "**/uv.lock",
];

/**
 * The caller workflow's inputs, as strings. The caller workflow runs from the default
 * branch, so a PR can't change the policy it's reviewed under.
 */
export interface PolicyInputs {
  readonly allowApprove: string;
  readonly model: string;
  readonly blockAtSeverity: string;
  readonly neverAutoApprove: string;
  readonly maxChangedLines: string;
}

function oneOf<T extends string>(name: string, value: string, options: readonly T[]): T {
  const match = options.find((option) => option === value);
  if (!match) throw new Error(`${name} must be one of ${options.join(", ")}, not "${value}"`);
  return match;
}

/** The model is passed in Claude's command-line arguments, so it can't carry other flags. */
function parseModel(input: string): string {
  const model = input.trim() || defaultModel;
  if (!/^[\w.:@/-]+$/.test(model)) throw new Error(`model has unexpected characters: "${model}"`);
  return model;
}

export function parsePolicy(inputs: PolicyInputs): RepoPolicy {
  const maxChangedLines = Number(inputs.maxChangedLines);
  if (!Number.isInteger(maxChangedLines) || maxChangedLines < 1) {
    throw new Error(
      `max-changed-lines must be a positive integer, not "${inputs.maxChangedLines}"`,
    );
  }
  const extraPaths = inputs.neverAutoApprove.split("\n").map((line) => line.trim()).filter(Boolean);
  return {
    allowApprove: oneOf("allow-approve", inputs.allowApprove, ["true", "false"]) === "true",
    model: parseModel(inputs.model),
    blockAtSeverity: oneOf("block-at-severity", inputs.blockAtSeverity, severities),
    neverAutoApprove: [...alwaysNeedsHuman, ...extraPaths],
    maxChangedLines,
    minimumAuthorRole: "write",
  };
}

export function atLeastSeverity(severity: Severity, threshold: Severity): boolean {
  return severities.indexOf(severity) >= severities.indexOf(threshold);
}

export function atLeastRole(role: RepositoryRole, minimum: RepositoryRole): boolean {
  return repositoryRoles.indexOf(role) >= repositoryRoles.indexOf(minimum);
}
