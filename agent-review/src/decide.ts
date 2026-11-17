import { matchingGlob } from "./glob.ts";
import { atLeastRole, atLeastSeverity, type RepoPolicy, type RepositoryRole } from "./policy.ts";
import type { Finding, ReviewResult } from "./result.ts";
import { codeSpan } from "./sanitize.ts";

export interface ChangedFile {
  readonly path: string;
  readonly previousPath?: string;
  readonly changes: number;
}

/** Live state fetched at publication time, never from the reviewer. */
export interface PullState {
  readonly headSha: string;
  readonly authorRole: RepositoryRole;
  readonly files: readonly ChangedFile[];
  readonly filesTruncated: boolean;
}

export type Verdict =
  | { readonly kind: "approve" }
  | { readonly kind: "request_changes"; readonly blocking: readonly Finding[] }
  | { readonly kind: "comment"; readonly reasons: readonly string[] };

export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

function protectedPaths(files: readonly ChangedFile[], globs: readonly string[]): string[] {
  return files.flatMap((file) =>
    [file.path, file.previousPath].filter(
      (path): path is string => path !== undefined && matchingGlob(path, globs) !== undefined,
    )
  );
}

function approvalBlockers(
  result: ReviewResult,
  reviewedHeadSha: string,
  pull: PullState,
  policy: RepoPolicy,
): string[] {
  const reasons: string[] = [];
  if (result.outcome !== "completed") reasons.push("The review was incomplete.");
  if (result.limitations.length) reasons.push("The reviewer reported limitations.");

  const notable = result.findings.filter((finding) => atLeastSeverity(finding.severity, "medium"));
  if (notable.length) reasons.push(`${notable.length} finding(s) at medium severity or above.`);

  if (pull.headSha !== reviewedHeadSha) reasons.push("New commits were pushed after the review.");

  const touched = protectedPaths(pull.files, policy.neverAutoApprove);
  if (touched.length) {
    const listed = touched.slice(0, 5).map(codeSpan).join(", ");
    reasons.push(`Changes paths that need human approval: ${listed}.`);
  }
  if (pull.filesTruncated) reasons.push("The changed-file list was truncated.");

  const changedLines = pull.files.reduce((total, file) => total + file.changes, 0);
  if (changedLines > policy.maxChangedLines) {
    reasons.push(`Changes ${changedLines} lines; the limit is ${policy.maxChangedLines}.`);
  }
  if (!atLeastRole(pull.authorRole, policy.minimumAuthorRole)) {
    reasons.push(`The author's role (${pull.authorRole}) is below ${policy.minimumAuthorRole}.`);
  }
  return reasons;
}

export function evaluate(
  result: ReviewResult,
  reviewedHeadSha: string,
  pull: PullState,
  policy: RepoPolicy,
): Verdict {
  const blocking = result.findings.filter((finding) =>
    atLeastSeverity(finding.severity, policy.blockAtSeverity)
  );
  if (blocking.length) return { kind: "request_changes", blocking };

  const reasons = approvalBlockers(result, reviewedHeadSha, pull, policy);
  return reasons.length ? { kind: "comment", reasons } : { kind: "approve" };
}

export function reviewEvent(verdict: Verdict, allowApprove: boolean): ReviewEvent {
  if (verdict.kind === "request_changes") return "REQUEST_CHANGES";
  if (verdict.kind === "approve" && allowApprove) return "APPROVE";
  return "COMMENT";
}

export interface EarlierReview {
  readonly id: number;
  readonly state: string;
}

/**
 * The bot's earlier reviews that this one supersedes. Withdrawing an approval is
 * always safe. Lifting a block needs a full review of the current head; otherwise
 * making the reviewer fail, or padding the PR past what it can read, would unblock it.
 */
export function supersededReviews(
  earlier: readonly EarlierReview[],
  review: {
    readonly result: ReviewResult;
    readonly verdict: Verdict;
    readonly event: ReviewEvent;
    readonly reviewedHeadSha: string;
    readonly pull: PullState;
  },
): number[] {
  const { result, verdict, event, reviewedHeadSha, pull } = review;
  const liftsBlocks = verdict.kind !== "request_changes" &&
    result.outcome === "completed" &&
    result.limitations.length === 0 &&
    !pull.filesTruncated &&
    pull.headSha === reviewedHeadSha;
  return earlier
    .filter((previous) =>
      (previous.state === "APPROVED" && event !== "APPROVE") ||
      (previous.state === "CHANGES_REQUESTED" && liftsBlocks)
    )
    .map((previous) => previous.id);
}
