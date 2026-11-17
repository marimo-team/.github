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
import type { Parsed } from "../src/reader.ts";
import { parseReviewResult, type ReviewResult } from "../src/result.ts";
import { applyVerification, parseVerification } from "../src/verification.ts";
import { runInfoFromEnv } from "./run-info.ts";

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
  // Skipped when the reviewer had no findings to verify.
  if (!["success", "skipped"].includes(requireEnv("VERIFY_JOB_RESULT"))) {
    await finish("Verifying the findings failed, so nothing was posted. See the run for details.");
    return;
  }
  let result: ReviewResult;
  let rejected: number;
  try {
    ({ result, rejected } = await readVerifiedResult());
  } catch (error) {
    await finish("The agents' output couldn't be used. See the run for details.");
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
  if (rejected) {
    notes.push(`Verification rejected ${rejected} candidate finding${rejected === 1 ? "" : "s"}.`);
  }
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
