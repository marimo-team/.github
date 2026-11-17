import { requireEnv, runMain, setOutput } from "../src/actions.ts";
import { findCredential } from "../src/credentials.ts";
import { parseReviewResult } from "../src/result.ts";

// Runs before the output is uploaded, because artifacts are as public as the repository.
await runMain(async () => {
  const raw = await Deno.readTextFile(requireEnv("OUTPUT_PATH"));
  const credential = findCredential(raw);
  if (credential) {
    throw new Error(
      `The agent's output contains what looks like ${credential}, so it was discarded`,
    );
  }
  if (requireEnv("PASS") !== "review") return;

  const parsed = parseReviewResult(raw);
  if (!parsed.ok) throw new Error(`The review result is invalid: ${parsed.errors.join("; ")}`);
  await setOutput("findings", String(parsed.value.findings.length));
});
