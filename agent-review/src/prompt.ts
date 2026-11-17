export interface PromptVariables {
  readonly repository: string;
  readonly number: number;
  readonly headSha: string;
  readonly headDir: string;
  readonly contextDir: string;
}

/**
 * Repository guidance is read from the base branch, so it is as trusted as the
 * central prompt. It is appended after the central rules so it can add focus areas
 * but can't displace the trust rules above it.
 */
export function renderPrompt(
  template: string,
  variables: PromptVariables,
  guidance: string | undefined,
): string {
  const rendered = template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    if (!(name in variables)) throw new Error(`Unknown prompt variable ${match}`);
    return String(variables[name as keyof PromptVariables]);
  });
  if (!guidance?.trim()) return rendered;
  return `${rendered.trimEnd()}\n\n## Repository guidance\n\nFrom the base branch's \`.github/agent-review.md\`:\n\n${guidance.trim()}\n`;
}
