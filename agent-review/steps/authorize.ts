import { requireEnv, requirePositiveInteger, requireSha, runMain } from "../src/actions.ts";
import { GitHubClient } from "../src/github.ts";
import { policyFromEnv } from "../src/inputs.ts";
import { atLeastRole, minimumRequesterRole } from "../src/policy.ts";

const reviewCodeRepository = "marimo-team/.github";

await runMain(async () => {
  const repository = requireEnv("REPOSITORY");
  const number = requirePositiveInteger("PR_NUMBER");
  const requester = requireEnv("REQUESTER");
  const policyRef = requireSha("POLICY_REF");
  // Fail before anything is posted if the caller's inputs are invalid.
  const policy = policyFromEnv();
  const token = requireEnv("GITHUB_TOKEN");
  const github = new GitHubClient(token, repository);

  // A fork's commit can be checked out by SHA from the parent, so require review code
  // that was merged.
  const { status } = await new GitHubClient(token, reviewCodeRepository).compare("main", policyRef);
  if (status !== "behind" && status !== "identical") {
    throw new Error(`policy-ref ${policyRef} isn't on ${reviewCodeRepository}'s main branch`);
  }

  // Applying a label only needs triage access, so check the requester explicitly.
  const role = await github.role(requester);
  if (!atLeastRole(role, minimumRequesterRole)) {
    throw new Error(`${requester} has ${role} access; reviews need ${minimumRequesterRole}`);
  }
  const pull = await github.pull(number);
  if (pull.state !== "open") throw new Error(`PR #${number} is ${pull.state}`);

  console.log(
    `Reviewing ${repository}#${number} with ${policy.model}${
      policy.allowApprove ? ", approval allowed" : ""
    }`,
  );
});
