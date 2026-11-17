export type Authority = "advisory" | "block" | "approve";
export type Harness = "claude" | "codex";

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
  readonly authority: Authority;
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

const defaults: RepoPolicy = {
  authority: "advisory",
  reviewer: { harness: "claude", model: "claude-opus-5-5" },
  blockAtSeverity: "high",
  neverAutoApprove: [
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
  ],
  maxChangedLines: 400,
  minimumAuthorRole: "write",
};

const policies: Readonly<Record<string, RepoPolicy>> = {
  "marimo-team/marimo": defaults,
};

export function resolvePolicy(repository: string): RepoPolicy {
  return policies[repository] ?? defaults;
}

export function atLeastSeverity(severity: Severity, threshold: Severity): boolean {
  return severities.indexOf(severity) >= severities.indexOf(threshold);
}

export function atLeastRole(role: RepositoryRole, minimum: RepositoryRole): boolean {
  return repositoryRoles.indexOf(role) >= repositoryRoles.indexOf(minimum);
}
