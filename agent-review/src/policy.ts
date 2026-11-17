export const harnesses = ["claude", "codex"] as const;
export type Harness = (typeof harnesses)[number];

export const severities = ["low", "medium", "high", "critical"] as const;
export type Severity = (typeof severities)[number];

export const repositoryRoles = ["none", "read", "triage", "write", "maintain", "admin"] as const;
export type RepositoryRole = (typeof repositoryRoles)[number];

/** Harness and model are one value so overriding the harness can't keep the other's model. */
export interface Reviewer {
  readonly harness: Harness;
  /** Omit to use the harness default. */
  readonly model?: string;
}

export interface RepoPolicy {
  /** Without it, the bot only requests changes or comments. */
  readonly allowApprove: boolean;
  readonly reviewer: Reviewer;
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

const defaultModels: Readonly<Record<Harness, string | undefined>> = {
  claude: "claude-opus-5-5",
  codex: undefined,
};

/** Paths every repository needs a human to approve; a repository can add to these. */
const alwaysNeedsHuman = [
  // Workflows, repository review guidance, and agent instructions.
  ".github/**",
  "REVIEW.md",
  "**/AGENTS.md",
  "**/CLAUDE.md",
  ".claude/**",
  ".codex/**",
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
  readonly harness: string;
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

export function parsePolicy(inputs: PolicyInputs): RepoPolicy {
  const harness = oneOf("harness", inputs.harness, harnesses);
  const maxChangedLines = Number(inputs.maxChangedLines);
  if (!Number.isInteger(maxChangedLines) || maxChangedLines < 1) {
    throw new Error(
      `max-changed-lines must be a positive integer, not "${inputs.maxChangedLines}"`,
    );
  }
  const extraPaths = inputs.neverAutoApprove.split("\n").map((line) => line.trim()).filter(Boolean);
  return {
    allowApprove: oneOf("allow-approve", inputs.allowApprove, ["true", "false"]) === "true",
    reviewer: { harness, model: inputs.model.trim() || defaultModels[harness] },
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
