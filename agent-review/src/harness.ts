import { reviewResultSchema } from "./result.ts";

export function schemaJson(): string {
  return JSON.stringify(reviewResultSchema);
}

/**
 * `--tools` removes every built-in tool except reading. No allow rules are added:
 * in `dontAsk` mode reads inside the workspace proceed and anything else, such as
 * reading `/proc` for the action's environment, is denied instead of prompted.
 * `--strict-mcp-config` ignores MCP servers defined by the checked-out repository.
 */
export function claudeArgs(model: string | undefined): string {
  const schema = schemaJson();
  // The action parses claude_args with shell-quote; the schema is single-quoted.
  if (schema.includes("'")) throw new Error("The result schema can't contain single quotes");
  return [
    ...(model ? [`--model ${model}`] : []),
    "--tools Read,Grep,Glob",
    "--disallowedTools Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch,Agent",
    "--permission-mode dontAsk",
    "--strict-mcp-config",
    "--max-turns 100",
    `--json-schema '${schema}'`,
  ].join(" ");
}
