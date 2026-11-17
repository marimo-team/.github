import {
  requireEnv,
  requirePositiveInteger,
  requireSha,
  runMain,
  setOutput,
  warning,
} from "../src/actions.ts";
import { comparisonFileLimit, GitHubClient } from "../src/github.ts";
import { claudeArgs, schemaJson } from "../src/harness.ts";
import { botLogin } from "../src/policy.ts";
import { renderPrompt } from "../src/prompt.ts";

const maxDiffBytes = 1_500_000;

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw error;
  }
}

await runMain(async () => {
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

  const prompt = renderPrompt(
    await Deno.readTextFile(requireEnv("PROMPT_TEMPLATE")),
    { repository, number, headSha, headDir, contextDir },
    await readOptional(`${workspace}/.github/agent-review.md`),
  );
  await Deno.writeTextFile(`${workspace}/${workDir}/prompt.md`, prompt);
  await Deno.writeTextFile(`${workspace}/${workDir}/result-schema.json`, schemaJson());
  await setOutput("prompt", prompt);
  await setOutput("claude-args", claudeArgs(Deno.env.get("MODEL") || undefined));
});
