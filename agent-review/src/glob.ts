const regexSpecials = /[.+^${}()|[\]\\]/g;

/** Supports `*`, `?`, and `**` (zero or more directories). */
export function globToRegExp(glob: string): RegExp {
  let pattern = "";
  for (let index = 0; index < glob.length; index++) {
    const char = glob.charAt(index);
    if (char === "*" && glob[index + 1] === "*") {
      const directoryPrefix = glob[index + 2] === "/";
      pattern += directoryPrefix ? "(?:.*/)?" : ".*";
      index += directoryPrefix ? 2 : 1;
    } else if (char === "*") {
      pattern += "[^/]*";
    } else if (char === "?") {
      pattern += "[^/]";
    } else {
      pattern += char.replace(regexSpecials, "\\$&");
    }
  }
  return new RegExp(`^${pattern}$`);
}

export function matchingGlob(path: string, globs: readonly string[]): string | undefined {
  return globs.find((glob) => globToRegExp(glob).test(path));
}
