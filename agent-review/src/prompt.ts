export interface PromptVariables {
  readonly repository: string;
  readonly number: number;
  readonly headSha: string;
  readonly headDir: string;
  readonly contextDir: string;
}

function reviewGuideSection(guide: string | undefined): string | undefined {
  // The file's own title would sit above this section's heading.
  const body = guide?.trim().replace(/^# .*\n*/, "");
  return body ? `## Review instructions\n\n${body}` : undefined;
}

/**
 * `reviewGuide` is the base branch's `REVIEW.md`, so it's as trusted as the central
 * prompt. It comes last, so it can add focus areas and recalibrate severity but
 * can't displace the trust rules.
 */
export function renderPrompt(
  templates: readonly string[],
  variables: PromptVariables,
  reviewGuide: string | undefined,
): string {
  const central = templates.map((template) =>
    template.trim().replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
      if (!(name in variables)) throw new Error(`Unknown prompt variable ${match}`);
      return String(variables[name as keyof PromptVariables]);
    })
  );
  const guide = reviewGuideSection(reviewGuide);
  return `${[...central, ...(guide ? [guide] : [])].join("\n\n")}\n`;
}
