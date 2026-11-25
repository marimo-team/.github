import {
  type EarlierReview,
  evaluate,
  type PullState,
  reviewEvent,
  supersededReviews,
} from "./decide.ts";
import { type AnchoredFindings, anchorFindings } from "./diff.ts";
import type { NewReview } from "./github.ts";
import { findingComment, reviewBody, type RunInfo } from "./messages.ts";
import type { RepoPolicy } from "./policy.ts";
import type { ReviewResult } from "./result.ts";

export interface ReviewPlan {
  readonly review: NewReview;
  /** Posted instead if GitHub rejects the inline comments' positions. */
  readonly fallback?: NewReview;
  /** The bot's earlier reviews to dismiss once this one is posted. */
  readonly dismiss: readonly number[];
}

export function planReview(input: {
  readonly result: ReviewResult;
  readonly run: RunInfo;
  readonly policy: RepoPolicy;
  readonly pull: PullState;
  /** Patches of the reviewed head, by path. */
  readonly patches: ReadonlyMap<string, string>;
  /** The bot's own earlier reviews on this PR. */
  readonly earlier: readonly EarlierReview[];
}): ReviewPlan {
  const { result, run, policy, pull, patches, earlier } = input;
  const verdict = evaluate(result, run.headSha, pull, policy);
  const event = reviewEvent(verdict, policy.allowApprove);
  const headMoved = pull.headSha !== run.headSha;
  const notes = headMoved ? ["Newer commits exist; this review doesn't cover them."] : [];

  const build = ({ inline, unanchored }: AnchoredFindings): NewReview => ({
    // GitHub rejects a commit a force-push removed, and line comments on a stale head.
    commit_id: headMoved ? undefined : run.headSha,
    event,
    body: reviewBody({ run, result, verdict, event, unanchored, notes }),
    comments: inline.map((finding) => ({
      path: finding.path,
      line: finding.line,
      side: finding.side,
      body: findingComment(finding),
    })),
  });
  const inBody = build({ inline: [], unanchored: result.findings });
  const anchored = headMoved
    ? { inline: [], unanchored: result.findings }
    : anchorFindings(result.findings, patches);

  return {
    review: anchored.inline.length ? build(anchored) : inBody,
    fallback: anchored.inline.length ? inBody : undefined,
    dismiss: supersededReviews(earlier, { result, event, reviewedHeadSha: run.headSha, pull }),
  };
}
