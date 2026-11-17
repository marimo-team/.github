import { requireEnv, requirePositiveInteger, runMain, setOutput, warning } from "../src/actions.ts";
import { GitHubClient } from "../src/github.ts";
import { progressBody } from "../src/messages.ts";
import { runInfoFromEnv } from "./run-info.ts";

await runMain(async () => {
  const number = requirePositiveInteger("PR_NUMBER");
  const github = new GitHubClient(requireEnv("GITHUB_TOKEN"), requireEnv("REPOSITORY"));

  const comment = await github.createComment(number, progressBody(runInfoFromEnv(), "Reviewing."));
  await setOutput("comment-id", String(comment.id));
  try {
    await github.addReaction(number, "eyes");
  } catch (error) {
    warning(`Could not add a reaction: ${error instanceof Error ? error.message : error}`);
  }
});
