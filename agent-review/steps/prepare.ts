import {
  requireEnv,
  requirePositiveInteger,
  requireSha,
  runMain,
  setOutput,
  warning,
} from "../src/actions.ts";
import { comparisonFileLimit, GitHubClient } from "../src/github.ts";
import { claudeArgs } from "../src/harness.ts";
import { botLogin } from "../src/policy.ts";
import { renderPrompt } from "../src/prompt.ts";
import { parseReviewResult, reviewResultSchema } from "../src/result.ts";
import { verificationSchema } from "../src/verification.ts";

const maxDiffBytes = 1_500_000;

const passes = {
  review: { template: "review.md", schema: reviewResultSchema },
  verify: { template: "verify.md", schema: verificationSchema },
} as const;
type Pass = keyof typeof passes;

function requirePass(): Pass {
  const pass = requireEnv("PASS");
  if (!(pass in passes)) throw new Error(`PASS must be one of ${Object.keys(passes).join(", ")}`);
  return pass as Pass;
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw error;
  }
}

function readTemplate(name: string): Promise<string> {
  return Deno.readTextFile(new URL(`../prompts/${name}`, import.meta.url));
}

/** Numbers the reviewer's findings so the verifier can answer for each one. */
async function writeCandidates(path: string): Promise<void> {
  const parsed = parseReviewResult(await Deno.readTextFile(requireEnv("REVIEW_RESULT_PATH")));
  if (!parsed.ok) throw new Error(`The review result is invalid: ${parsed.errors.join("; ")}`);
  const candidates = parsed.value.findings.map((finding, index) => ({ index, ...finding }));
  await Deno.writeTextFile(path, JSON.stringify(candidates, null, 2));
}

await runMain(async () => {
  const pass = requirePass();
  const repository = requireEnv("REPOSITORY");
  const number = requirePositiveInteger("PR_NUMBER");
  const baseSha = requireSha("BASE_SHA");
  const headSha = requireSha("HEAD_SHA");
  const workspace = requireEnv("GITHUB_WORKSPACE");
  const headDir = requireEnv("HEAD_DIR");
  const workDir = requireEnv("WORK_DIR");
  const contextDir = `${workDir}/context`;
  const github = new GitHubClient(requireEnv("GITHUB_TOKEN"), repository);

  const [pull, comparison, earlierComments] = await Promise.all([
    github.pull(number),
    github.compare(baseSha, headSha),
    github.reviewComments(number),
  ]);
  const files = comparison.files ?? [];
  const limitations: string[] = [];
  if (files.length >= comparisonFileLimit) {
    limitations.push(`Only the first ${comparisonFileLimit} changed files are listed.`);
  }

  let diff = "";
  try {
    diff = await github.compareDiff(baseSha, headSha);
  } catch (error) {
    warning(`Could not fetch the diff: ${error instanceof Error ? error.message : error}`);
    limitations.push("The full diff was unavailable; use the per-file patch summaries instead.");
  }
  if (diff.length > maxDiffBytes) {
    diff = diff.slice(0, maxDiffBytes);
    limitations.push("changes.diff was truncated; read the remaining files in the PR head.");
  }

  await Deno.mkdir(`${workspace}/${contextDir}`, { recursive: true });
  await Deno.writeTextFile(
    `${workspace}/${contextDir}/pull-request.json`,
    JSON.stringify(
      {
        repository,
        number,
        title: pull.title,
        description: pull.body ?? "",
        author: pull.user.login,
        baseSha,
        headSha,
        mergeBaseSha: comparison.merge_base_commit.sha,
        files: files.map((file) => ({
          path: file.filename,
          previousPath: file.previous_filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          patch: diff ? undefined : file.patch,
        })),
        limitations,
      },
      null,
      2,
    ),
  );
  await Deno.writeTextFile(`${workspace}/${contextDir}/changes.diff`, diff);
  await Deno.writeTextFile(
    `${workspace}/${contextDir}/previous-findings.json`,
    JSON.stringify(
      earlierComments
        .filter((comment) => comment.user?.login === botLogin)
        .map(({ path, line, body }) => ({ path, line, body })),
      null,
      2,
    ),
  );
  if (pass === "verify") await writeCandidates(`${workspace}/${contextDir}/candidates.json`);

  const { template, schema } = passes[pass];
  const prompt = renderPrompt(
    [await readTemplate(template), await readTemplate("shared.md")],
    { repository, number, headSha, headDir, contextDir },
    await readOptional(`${workspace}/REVIEW.md`),
  );
  await Deno.writeTextFile(`${workspace}/${workDir}/prompt.md`, prompt);
  await Deno.writeTextFile(`${workspace}/${workDir}/schema.json`, JSON.stringify(schema));
  await setOutput("prompt", prompt);
  await setOutput("claude-args", claudeArgs(Deno.env.get("MODEL") || undefined, schema));
});
