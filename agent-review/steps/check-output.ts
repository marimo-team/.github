import { requireEnv, runMain, setOutput } from "../src/actions.ts";
import { findCredential } from "../src/credentials.ts";
import type { Parsed } from "../src/reader.ts";
import { parseReviewResult, withoutHeadDir } from "../src/result.ts";
import { parseVerification } from "../src/verification.ts";

function valueOf<T>(name: string, parsed: Parsed<T>): T {
  if (!parsed.ok) throw new Error(`The ${name} is invalid: ${parsed.errors.join("; ")}`);
  return parsed.value;
}

// Runs before the output is uploaded, because artifacts are as public as the repository.
// Failing here, rather than in publish, reports which agent produced bad output.
await runMain(async () => {
  const outputPath = requireEnv("OUTPUT_PATH");
  const raw = await Deno.readTextFile(outputPath);
  const credential = findCredential(raw);
  if (credential) {
    throw new Error(
      `The agent's output contains what looks like ${credential}, so it was discarded`,
    );
  }

  if (requireEnv("PASS") === "verify") {
    const review = await Deno.readTextFile(requireEnv("REVIEW_RESULT_PATH"));
    const candidates = valueOf("review result", parseReviewResult(review)).findings;
    valueOf("verification", parseVerification(raw, candidates.length));
    return;
  }

  // Later jobs read this canonical form, so they agree on paths and finding indexes.
  const result = withoutHeadDir(
    valueOf("review result", parseReviewResult(raw)),
    requireEnv("HEAD_DIR"),
  );
  await Deno.writeTextFile(outputPath, JSON.stringify(result, null, 2));
  await setOutput("findings", String(result.findings.length));
});
