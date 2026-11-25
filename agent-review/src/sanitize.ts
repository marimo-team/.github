const blockedTag =
  /<\s*\/?\s*(?:img|picture|source|video|audio|iframe|object|embed|details|summary)\b[^>]*>/gi;
const atEntity = /&(?:#0*64|#x0*40|commat);/gi;

function stripBlocked(text: string): string {
  return text.replace(blockedTag, "").replaceAll("![", "[").replace(atEntity, "@");
}

/**
 * Model output is untrusted. GitHub fetches images server-side, so an injected
 * reviewer could exfiltrate private code through an image URL; image syntax and
 * media tags are removed. Collapsible sections are removed so output can't close
 * or open the review's own. Mentions are defused so output can't ping people.
 */
export function sanitizeMarkdown(text: string): string {
  // Removing one tag can join its neighbours into another, so repeat until stable.
  let current = text;
  for (let previous = ""; current !== previous;) {
    previous = current;
    current = stripBlocked(current);
  }
  return current.replace(/@(?=[A-Za-z0-9])/g, "@​");
}

/** Wraps text in a code span; backticks in it would end the span early. */
export function codeSpan(text: string): string {
  return `\`${sanitizeMarkdown(text.replaceAll("`", "'"))}\``;
}
