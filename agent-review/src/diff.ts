import type { DiffSide, Finding } from "./result.ts";

export interface CommentableLines {
  readonly LEFT: ReadonlySet<number>;
  readonly RIGHT: ReadonlySet<number>;
}

const hunkHeader = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Lines GitHub accepts review comments on, per side, from a unified diff patch. */
export function commentableLines(patch: string): CommentableLines {
  const left = new Set<number>();
  const right = new Set<number>();
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const line of patch.split("\n")) {
    const header = hunkHeader.exec(line);
    if (header) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("+")) {
      right.add(newLine++);
    } else if (line.startsWith("-")) {
      left.add(oldLine++);
    } else if (line.startsWith(" ")) {
      left.add(oldLine++);
      right.add(newLine++);
    }
  }
  return { LEFT: left, RIGHT: right };
}

export interface AnchoredFindings {
  readonly inline: readonly Finding[];
  readonly unanchored: readonly Finding[];
}

/** GitHub rejects a whole review if any comment targets a line outside the diff. */
export function anchorFindings(
  findings: readonly Finding[],
  patches: ReadonlyMap<string, string>,
): AnchoredFindings {
  const linesByPath = new Map<string, CommentableLines>();
  const isCommentable = (path: string, side: DiffSide, line: number): boolean => {
    const patch = patches.get(path);
    if (patch === undefined) return false;
    let lines = linesByPath.get(path);
    if (!lines) {
      lines = commentableLines(patch);
      linesByPath.set(path, lines);
    }
    return lines[side].has(line);
  };

  const inline: Finding[] = [];
  const unanchored: Finding[] = [];
  for (const finding of findings) {
    (isCommentable(finding.path, finding.side, finding.line) ? inline : unanchored).push(finding);
  }
  return { inline, unanchored };
}
