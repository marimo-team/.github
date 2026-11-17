import {
  requireEnv,
  requirePositiveInteger,
  requireSha,
  runMain,
  warning,
} from "../src/actions.ts";
import { evaluate, type PullState, reviewEvent, supersededReviews } from "../src/decide.ts";
import { type AnchoredFindings, anchorFindings } from "../src/diff.ts";
import { comparisonFileLimit, GitHubClient, GitHubError } from "../src/github.ts";
import { findingComment, progressBody, reviewBody, type RunInfo } from "../src/messages.ts";
import { botLogin, type RepoPolicy, reviewLabel } from "../src/policy.ts";
import type { Parsed } from "../src/reader.ts";
import { parseReviewResult, type ReviewResult } from "../src/result.ts";
import { applyVerification, parseVerification } from "../src/verification.ts";
import { policyFromEnv, runInfoFromEnv } from "./run-info.ts";

async function readOutput<T>(
  agent: string,
  path: string,
  parse: (raw: string) => Parsed<T>,
): Promise<T> {
  let raw: string;
  try {
    raw = await Deno.readTextFile(path);
  } catch {
    throw new Error(`The ${agent} produced no output`);
  }
  const parsed = parse(raw);
  if (!parsed.ok) throw new Error(`The ${agent}'s output was invalid: ${parsed.errors.join("; ")}`);
  return parsed.value;
}

/** The review result with only the findings the verifier confirmed. */
async function readVerifiedResult(): Promise<{ result: ReviewResult; rejected: number }> {
  const candidates = await readOutput("reviewer", requireEnv("RESULT_PATH"), parseReviewResult);
  if (candidates.findings.length === 0) return { result: candidates, rejected: 0 };
  const checks = await readOutput(
    "verifier",
    requireEnv("VERIFICATION_PATH"),
    (raw) => parseVerification(raw, candidates.findings.length),
  );
  return applyVerification(candidates, checks);
}

/** A 422 caused by an inline comment's position, rather than the body or the commit. */
function isAnchoringError(error: unknown): boolean {
  return error instanceof GitHubError && error.status === 422 &&
    /pull_request_review_thread|\bline\b|\bpath\b|\bposition\b/i.test(error.detail);
}

interface Context {
  readonly policy: RepoPolicy;
  readonly number: number;
  readonly baseSha: string;
  readonly run: RunInfo;
  readonly reader: GitHubClient;
  readonly writer: GitHubClient;
}

/** Posts the review and returns the status for the progress comment. */
async function publish({ policy, number, baseSha, run, reader, writer }: Context) {
  if (requireEnv("REVIEW_JOB_RESULT") !== "success") {
    return "The review failed before producing a result. See the run for details.";
  }
  // Skipped when the reviewer had no findings to verify.
  if (!["success", "skipped"].includes(requireEnv("VERIFY_JOB_RESULT"))) {
    return "Verifying the findings failed, so nothing was posted. See the run for details.";
  }
  const { result, rejected } = await readVerifiedResult();

  const [pull, comparison, earlierReviews] = await Promise.all([
    reader.pull(number),
    reader.compare(baseSha, run.headSha),
    reader.reviews(number),
  ]);
  if (pull.state !== "open") {
    return "The PR was closed before the review finished, so nothing was posted.";
  }

  const files = comparison.files ?? [];
  const state: PullState = {
    headSha: pull.head.sha,
    authorRole: await reader.role(pull.user.login),
    files: files.map((file) => ({
      path: file.filename,
      previousPath: file.previous_filename,
      changes: file.changes,
    })),
    filesTruncated: files.length >= comparisonFileLimit,
  };
  const verdict = evaluate(result, run.headSha, state, policy);
  const event = reviewEvent(verdict, policy.allowApprove);

  const patches = new Map<string, string>();
  for (const file of files) {
    if (file.patch !== undefined) patches.set(file.filename, file.patch);
  }
  const notes: string[] = [];
  if (rejected) {
    notes.push(`Verification rejected ${rejected} candidate finding${rejected === 1 ? "" : "s"}.`);
  }
  const headMoved = pull.head.sha !== run.headSha;
  if (headMoved) notes.push("Newer commits exist; this review doesn't cover them.");

  const submit = ({ inline, unanchored }: AnchoredFindings) =>
    writer.createReview(number, {
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
  const inBody: AnchoredFindings = { inline: [], unanchored: result.findings };
  const anchored = headMoved ? inBody : anchorFindings(result.findings, patches);
  const review = await submit(anchored).catch((error) => {
    if (!(anchored.inline.length && isAnchoringError(error))) throw error;
    warning(
      `GitHub rejected the inline comments; posting them in the review body: ${error.message}`,
    );
    return submit(inBody);
  });

  const superseded = supersededReviews(
    earlierReviews.filter((earlier) => earlier.user?.login === botLogin),
    {
      result,
      verdict,
      event,
      reviewedHeadSha: run.headSha,
      pull: state,
    },
  );
  for (const id of superseded) {
    try {
      await writer.dismissReview(number, id, `Superseded by a later review of ${run.headSha}.`);
    } catch (error) {
      warning(`Could not dismiss review ${id}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return `Review posted: ${review.html_url}`;
}

await runMain(async () => {
  const repository = requireEnv("REPOSITORY");
  const number = requirePositiveInteger("PR_NUMBER");
  const commentId = requirePositiveInteger("COMMENT_ID");
  const run = runInfoFromEnv();
  // Reads use the job's read-only token; only writes use the bot.
  const reader = new GitHubClient(requireEnv("READ_TOKEN"), repository);
  const writer = new GitHubClient(requireEnv("WRITE_TOKEN"), repository);

  const finish = async (status: string) => {
    await writer.updateComment(commentId, progressBody(run, status));
    await writer.removeLabel(number, reviewLabel);
  };

  let status: string;
  try {
    status = await publish({
      policy: policyFromEnv(),
      number,
      baseSha: requireSha("BASE_SHA"),
      run,
      reader,
      writer,
    });
  } catch (error) {
    await finish("The review couldn't be posted. See the run for details.").catch((cleanup) =>
      warning(`Could not update the progress comment: ${cleanup}`)
    );
    throw error;
  }
  await finish(status);
});
