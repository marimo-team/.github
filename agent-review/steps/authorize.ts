import { requireEnv, requirePositiveInteger, runMain } from "../src/actions.ts";
import { GitHubClient } from "../src/github.ts";
import { atLeastRole, minimumRequesterRole } from "../src/policy.ts";
import { policyFromEnv } from "./run-info.ts";

await runMain(async () => {
  const repository = requireEnv("REPOSITORY");
  const number = requirePositiveInteger("PR_NUMBER");
  const requester = requireEnv("REQUESTER");
  // Fail before anything is posted if the caller's inputs are invalid.
  const policy = policyFromEnv();
  const github = new GitHubClient(requireEnv("GITHUB_TOKEN"), repository);

  // Applying a label only needs triage access, so check the requester explicitly.
  const role = await github.role(requester);
  if (!atLeastRole(role, minimumRequesterRole)) {
    throw new Error(`${requester} has ${role} access; reviews need ${minimumRequesterRole}`);
  }
  const pull = await github.pull(number);
  if (pull.state !== "open") throw new Error(`PR #${number} is ${pull.state}`);

  console.log(
    `Reviewing ${repository}#${number} with ${policy.reviewer.harness}${
      policy.allowApprove ? ", approval allowed" : ""
    }`,
  );
});
