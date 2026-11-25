import {
  errorMessage,
  requireEnv,
  requirePositiveInteger,
  requireSha,
  runMain,
  setOutput,
  warning,
} from "../src/actions.ts";
import { fetchReviewMaterial } from "../src/coverage.ts";
import { GitHubClient } from "../src/github.ts";
import { policyFromEnv } from "../src/inputs.ts";
import { botLogin } from "../src/policy.ts";
import { renderPrompt } from "../src/prompt.ts";
import { reviewResultSchema } from "../src/result.ts";

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

await runMain(async () => {
  const repository = requireEnv("REPOSITORY");
  const number = requirePositiveInteger("PR_NUMBER");
  const baseSha = requireSha("BASE_SHA");
  const headSha = requireSha("HEAD_SHA");
  const workspace = requireEnv("GITHUB_WORKSPACE");
  const headDir = requireEnv("HEAD_DIR");
  const contextDir = `${requireEnv("WORK_DIR")}/context`;
  const github = new GitHubClient(requireEnv("GITHUB_TOKEN"), repository);

  const [pull, material, earlierComments] = await Promise.all([
    github.pull(number),
    fetchReviewMaterial(
      github,
      baseSha,
      headSha,
      (error) => warning(`Could not fetch the diff: ${errorMessage(error)}`),
    ),
    github.reviewComments(number),
  ]);

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
        mergeBaseSha: material.comparison.merge_base_commit.sha,
        files: material.files.map((file) => ({
          path: file.filename,
          previousPath: file.previous_filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          patch: material.diff ? undefined : file.patch,
        })),
        gaps: material.gaps,
      },
      null,
      2,
    ),
  );
  await Deno.writeTextFile(`${workspace}/${contextDir}/changes.diff`, material.diff);
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
  await Deno.writeTextFile(
    `${workspace}/${requireEnv("SCHEMA_FILE")}`,
    JSON.stringify(reviewResultSchema),
  );
  const prompt = renderPrompt(
    [await readTemplate("review.md"), await readTemplate("shared.md")],
    { repository, number, headSha, headDir, contextDir },
    await readOptional(`${workspace}/REVIEW.md`),
  );
  await setOutput("prompt", prompt);
  await setOutput("model", policyFromEnv().model);
});
