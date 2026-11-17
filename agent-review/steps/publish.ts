import {
  requireEnv,
  requirePositiveInteger,
  requireSha,
  runMain,
  warning,
} from "../src/actions.ts";
import {
  clearsEarlierBlocks,
  combineCi,
  evaluate,
  type PullState,
  reviewEvent,
} from "../src/decide.ts";
import { anchorFindings } from "../src/diff.ts";
import { comparisonFileLimit, GitHubClient, GitHubError } from "../src/github.ts";
import { findingComment, progressBody, reviewBody } from "../src/messages.ts";
import { botLogin, resolvePolicy, reviewLabel } from "../src/policy.ts";
import { parseReviewResult, type ReviewResult } from "../src/result.ts";
import { runInfoFromEnv } from "./run-info.ts";

async function readResult(path: string): Promise<ReviewResult> {
  let raw: string;
  try {
    raw = await Deno.readTextFile(path);
  } catch {
    throw new Error("The reviewer produced no result");
  }
  const parsed = parseReviewResult(raw);
  if (!parsed.ok) throw new Error(`The reviewer's result was invalid: ${parsed.errors.join("; ")}`);
  return parsed.result;
}

await runMain(async () => {
  const repository = requireEnv("REPOSITORY");
  const number = requirePositiveInteger("PR_NUMBER");
  const baseSha = requireSha("BASE_SHA");
  const commentId = requirePositiveInteger("COMMENT_ID");
  const run = runInfoFromEnv();
  const policy = resolvePolicy(repository);
  // Reads use the job's read-only token; only writes use the bot.
  const reader = new GitHubClient(requireEnv("READ_TOKEN"), repository);
  const writer = new GitHubClient(requireEnv("WRITE_TOKEN"), repository);

  const finish = async (status: string) => {
    await writer.updateComment(commentId, progressBody(run, status));
    await writer.removeLabel(number, reviewLabel);
  };

  if (requireEnv("REVIEW_JOB_RESULT") !== "success") {
    await finish("The review failed before producing a result. See the run for details.");
    return;
  }
  let result: ReviewResult;
  try {
    result = await readResult(requireEnv("RESULT_PATH"));
  } catch (error) {
    await finish("The reviewer's output couldn't be used. See the run for details.");
    throw error;
  }

  const [pull, comparison, checkRuns, status, earlierReviews] = await Promise.all([
    reader.pull(number),
    reader.compare(baseSha, run.headSha),
    reader.checkRuns(run.headSha),
    reader.combinedStatus(run.headSha),
    reader.reviews(number),
  ]);
  if (pull.state !== "open") {
    await finish("The PR was closed before the review finished, so nothing was posted.");
    return;
  }

  const files = comparison.files ?? [];
  const state: PullState = {
    open: true,
    draft: pull.draft,
    headSha: pull.head.sha,
    authorRole: await reader.role(pull.user.login),
    files: files.map((file) => ({
      path: file.filename,
      previousPath: file.previous_filename,
      changes: file.changes,
    })),
    filesTruncated: files.length >= comparisonFileLimit,
    ci: combineCi(checkRuns, { state: status.state, totalCount: status.total_count }),
  };
  const verdict = evaluate(result, run.headSha, state, policy);
  const event = reviewEvent(verdict, policy.authority);

  const patches = new Map<string, string>();
  for (const file of files) {
    if (file.patch !== undefined) patches.set(file.filename, file.patch);
  }
  let { inline, unanchored } = anchorFindings(result.findings, patches);
  const notes: string[] = [];
  if (pull.head.sha !== run.headSha) {
    notes.push("Newer commits exist; this review doesn't cover them.");
  }

  const submit = () =>
    writer.createReview(number, {
      commit_id: run.headSha,
      event,
      body: reviewBody({
        run,
        result,
        verdict,
        event,
        authority: policy.authority,
        unanchored,
        notes,
      }),
      comments: inline.map((finding) => ({
        path: finding.path,
        line: finding.line,
        side: finding.side,
        body: findingComment(finding),
      })),
    });
  const review = await submit().catch((error) => {
    if (!(error instanceof GitHubError && error.status === 422 && inline.length)) throw error;
    warning(
      `GitHub rejected the inline comments; posting them in the review body: ${error.message}`,
    );
    unanchored = result.findings;
    inline = [];
    return submit();
  });

  if (clearsEarlierBlocks(result, verdict, policy.authority)) {
    const blocks = earlierReviews.filter((earlier) =>
      earlier.user?.login === botLogin && earlier.state === "CHANGES_REQUESTED"
    );
    for (const block of blocks) {
      try {
        await writer.dismissReview(
          number,
          block.id,
          `Superseded by a later review of ${run.headSha}.`,
        );
      } catch (error) {
        warning(
          `Could not dismiss review ${block.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }

  await finish(`Review posted: ${review.html_url}`);
});
