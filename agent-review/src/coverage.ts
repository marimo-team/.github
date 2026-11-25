import { type ComparedFile, type Comparison, comparisonFileLimit, GitHubClient } from "./github.ts";
import { codeSpan } from "./sanitize.ts";

export const maxDiffLength = 1_500_000;

/** What the reviewer is given: the changed files, the diff, and what they leave out. */
export interface ReviewMaterial {
  readonly comparison: Comparison;
  readonly files: readonly ComparedFile[];
  readonly diff: string;
  readonly gaps: readonly string[];
}

/** A file with no patch is binary, too large for GitHub to diff, or only changes its mode. */
function hasUnreviewableContent(file: ComparedFile): boolean {
  const pureRename = file.status === "renamed" && file.changes === 0;
  return file.patch === undefined && !pureRename;
}

/** Parts of the change the diff leaves out, so the agent reads those files directly. */
export function coverageGaps(
  files: readonly ComparedFile[],
  diffLength: number | undefined,
): string[] {
  const gaps: string[] = [];
  if (files.length >= comparisonFileLimit) {
    gaps.push(`Only the first ${comparisonFileLimit} changed files are listed.`);
  }
  if (diffLength === undefined) gaps.push("The full diff was unavailable.");
  else if (diffLength > maxDiffLength) gaps.push("The diff is too large to review in full.");
  const unreviewable = files.filter(hasUnreviewableContent).map((file) => file.filename);
  if (unreviewable.length) {
    const listed = unreviewable.slice(0, 5).map(codeSpan).join(", ");
    gaps.push(`${unreviewable.length} file(s) have no textual diff, such as ${listed}.`);
  }
  return gaps;
}

export async function fetchReviewMaterial(
  github: GitHubClient,
  baseSha: string,
  headSha: string,
  onDiffError: (error: unknown) => void,
): Promise<ReviewMaterial> {
  const [comparison, diff] = await Promise.all([
    github.compare(baseSha, headSha),
    github.compareDiff(baseSha, headSha).catch((error: unknown) => {
      onDiffError(error);
      return undefined;
    }),
  ]);
  const files = comparison.files ?? [];
  return {
    comparison,
    files,
    diff: diff?.slice(0, maxDiffLength) ?? "",
    gaps: coverageGaps(files, diff?.length),
  };
}
