export const maxPathLength = 500;

export function isRelativeRepositoryPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= maxPathLength &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").some((part) => part === "" || part === "." || part === "..") &&
    !Array.from(path).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  );
}

const instructionFileNames = ["AGENTS.md", "CLAUDE.md"] as const;

function depth(directory: string): number {
  return directory === "" ? 0 : directory.split("/").length;
}

/**
 * The instruction files that apply to a set of changed paths: those at the root and
 * in every ancestor directory of a changed file, shallowest first.
 */
export function instructionFileCandidates(changedPaths: Iterable<string>): string[] {
  const directories = new Set<string>([""]);
  for (const path of changedPaths) {
    if (!isRelativeRepositoryPath(path)) continue;
    const parents = path.split("/").slice(0, -1);
    for (let length = 1; length <= parents.length; length++) {
      directories.add(parents.slice(0, length).join("/"));
    }
  }
  return [...directories]
    .sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))
    .flatMap((directory) =>
      instructionFileNames.map((name) => directory ? `${directory}/${name}` : name)
    );
}
