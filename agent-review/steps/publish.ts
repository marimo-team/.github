import {
  errorMessage,
  requireEnv,
  requirePositiveInteger,
  requireSha,
  runMain,
  warning,
} from "../src/actions.ts";
import { GitHubClient, isAnchoringError } from "../src/github.ts";
import { runInfoFromEnv } from "../src/inputs.ts";
import { progressBody, type RunInfo } from "../src/messages.ts";
import { planReview } from "../src/plan.ts";
import { reviewLabel } from "../src/policy.ts";
import { parseReviewResult, type ReviewResult } from "../src/result.ts";

async function readResult(): Promise<ReviewResult> {
  let raw: string;
  try {
    raw = await Deno.readTextFile(requireEnv("RESULT_PATH"));
  } catch {
    throw new Error("The reviewer produced no output");
  }
  const parsed = parseReviewResult(raw);
  if (!parsed.ok) throw new Error(`The reviewer's output was invalid: ${parsed.errors.join("; ")}`);
  return parsed.value;
}

interface Context {
  readonly number: number;
  readonly baseSha: string;
  readonly run: RunInfo;
  readonly github: GitHubClient;
  readonly bot: GitHubClient;
}

/** Posts the review and returns the status for the progress comment. */
async function publish({ number, baseSha, run, github, bot }: Context) {
  if (requireEnv("REVIEW_JOB_RESULT") !== "success") {
    return "The review failed before producing a result. See the run for details.";
  }
  const result = await readResult();

  const [pull, comparison] = await Promise.all([
    github.pull(number),
    github.compare(baseSha, run.headSha),
  ]);
  if (pull.state !== "open") {
    return "The PR was closed before the review finished, so nothing was posted.";
  }
  const patches = new Map(
    (comparison.files ?? []).flatMap((file) =>
      file.patch === undefined ? [] : [[file.filename, file.patch] as const]
    ),
  );
  const plan = planReview({ result, run, pull: { headSha: pull.head.sha }, patches });

  const review = await bot.createReview(number, plan.review).catch((error) => {
    if (!(plan.fallback && isAnchoringError(error))) throw error;
    warning(
      `GitHub rejected the inline comments; posting them in the body: ${errorMessage(error)}`,
    );
    return bot.createReview(number, plan.fallback);
  });
  return `Review posted: ${review.html_url}`;
}

await runMain(async () => {
  const repository = requireEnv("REPOSITORY");
  const number = requirePositiveInteger("PR_NUMBER");
  const commentId = requirePositiveInteger("COMMENT_ID");
  const run = runInfoFromEnv();
  // Reads use the job's read-only token; only writes use the bot.
  const github = new GitHubClient(requireEnv("READ_TOKEN"), repository);
  const bot = new GitHubClient(requireEnv("WRITE_TOKEN"), repository);

  const finish = async (status: string) => {
    await bot.updateComment(commentId, progressBody(run, status));
    await bot.removeLabel(number, reviewLabel);
  };

  let status: string;
  try {
    status = await publish({
      number,
      baseSha: requireSha("BASE_SHA"),
      run,
      github,
      bot,
    });
  } catch (error) {
    await finish("The review couldn't be posted. See the run for details.").catch((cleanup) =>
      warning(`Could not update the progress comment: ${errorMessage(cleanup)}`)
    );
    throw error;
  }
  await finish(status);
});
