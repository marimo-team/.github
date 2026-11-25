import { type AnchoredFindings, anchorFindings } from "./diff.ts";
import type { NewReview } from "./github.ts";
import { findingComment, reviewBody, type RunInfo } from "./messages.ts";
import type { ReviewResult } from "./result.ts";

/** Live state fetched when publishing, never taken from the agent's output. */
export interface PullState {
  readonly headSha: string;
}

export interface ReviewPlan {
  readonly review: NewReview;
  /** Posted instead if GitHub rejects the inline comments' positions. */
  readonly fallback?: NewReview;
}

export function planReview(input: {
  readonly result: ReviewResult;
  readonly run: RunInfo;
  readonly pull: PullState;
  /** Patches of the reviewed head, by path. */
  readonly patches: ReadonlyMap<string, string>;
}): ReviewPlan {
  const { result, run, pull, patches } = input;
  const headMoved = pull.headSha !== run.headSha;
  const notes = headMoved ? ["Newer commits exist; this review doesn't cover them."] : [];

  const build = ({ inline, unanchored }: AnchoredFindings): NewReview => ({
    // GitHub rejects a commit a force-push removed, and line comments on a stale head.
    commit_id: headMoved ? undefined : run.headSha,
    event: "COMMENT",
    body: reviewBody({ run, result, unanchored, notes }),
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
  };
}
