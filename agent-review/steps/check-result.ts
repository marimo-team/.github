import { requireEnv, runMain, setOutput } from "../src/actions.ts";
import { parseReviewResult } from "../src/result.ts";

await runMain(async () => {
  const parsed = parseReviewResult(await Deno.readTextFile(requireEnv("RESULT_PATH")));
  if (!parsed.ok) throw new Error(`The review result is invalid: ${parsed.errors.join("; ")}`);
  await setOutput("findings", String(parsed.value.findings.length));
});
