import { requireEnv, runMain } from "../src/actions.ts";
import { findCredential } from "../src/credentials.ts";
import { headPathNormalizer, parseReviewResult } from "../src/result.ts";

// Runs before the output is uploaded, because artifacts are as public as the repository.
await runMain(async () => {
  const resultPath = requireEnv("RESULT_PATH");
  const raw = await Deno.readTextFile(resultPath);
  const credential = findCredential(raw);
  if (credential) {
    throw new Error(
      `The agent's output contains what looks like ${credential}, so it was discarded`,
    );
  }

  const normalizePath = headPathNormalizer(requireEnv("GITHUB_WORKSPACE"), requireEnv("HEAD_DIR"));
  const parsed = parseReviewResult(raw, normalizePath);
  if (!parsed.ok) throw new Error(`The review result is invalid: ${parsed.errors.join("; ")}`);
  await Deno.writeTextFile(resultPath, JSON.stringify(parsed.value, null, 2));
});
