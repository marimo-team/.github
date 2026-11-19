import { requireEnv, runMain } from "../src/actions.ts";
import { findCredential } from "../src/credentials.ts";
import { parseReviewResult, withoutHeadDir } from "../src/result.ts";

// Runs before the output is uploaded, because artifacts are as public as the repository.
await runMain(async () => {
  const outputPath = requireEnv("OUTPUT_PATH");
  const raw = await Deno.readTextFile(outputPath);
  const credential = findCredential(raw);
  if (credential) {
    throw new Error(
      `The agent's output contains what looks like ${credential}, so it was discarded`,
    );
  }

  const parsed = parseReviewResult(raw);
  if (!parsed.ok) throw new Error(`The review result is invalid: ${parsed.errors.join("; ")}`);
  const result = withoutHeadDir(parsed.value, requireEnv("HEAD_DIR"));
  await Deno.writeTextFile(outputPath, JSON.stringify(result, null, 2));
});
