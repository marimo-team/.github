export interface PromptVariables {
  readonly repository: string;
  readonly number: number;
  readonly headSha: string;
  readonly headDir: string;
  readonly contextDir: string;
}

/** Read from the base branch, so they're as trusted as the central prompt. */
export interface RepositoryInstructions {
  /** The repository's `REVIEW.md`. */
  readonly reviewGuide: string | undefined;
  /** `AGENTS.md` and `CLAUDE.md` files that apply to the changed paths. */
  readonly projectFiles: readonly string[];
}

function projectSection(files: readonly string[]): string | undefined {
  if (!files.length) return undefined;
  const list = files.map((file) => `- \`${file}\``).join("\n");
  return `## Project instructions\n\nFollow these base-branch files and any files they reference with \`@path\`:\n\n${list}`;
}

function reviewGuideSection(guide: string | undefined): string | undefined {
  // The file's own title would sit above this section's heading.
  const body = guide?.trim().replace(/^# .*\n*/, "");
  return body ? `## Review instructions\n\n${body}` : undefined;
}

/**
 * Repository instructions come after the central sections, so they can add focus
 * areas and recalibrate severity but can't displace the trust rules.
 */
export function renderPrompt(
  templates: readonly string[],
  variables: PromptVariables,
  instructions: RepositoryInstructions,
): string {
  const central = templates.map((template) =>
    template.trim().replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
      if (!(name in variables)) throw new Error(`Unknown prompt variable ${match}`);
      return String(variables[name as keyof PromptVariables]);
    })
  );
  const sections = [
    ...central,
    projectSection(instructions.projectFiles),
    reviewGuideSection(instructions.reviewGuide),
  ];
  return `${sections.filter((section) => section !== undefined).join("\n\n")}\n`;
}
