const mediaTag = /<\s*\/?\s*(?:img|picture|source|video|audio|iframe|object|embed)\b[^>]*>/gi;
const atEntity = /&#(?:0*64|x0*40);/gi;

function stripMedia(text: string): string {
  return text.replace(mediaTag, "").replaceAll("![", "[").replace(atEntity, "@");
}

/**
 * Model output is untrusted. GitHub fetches images server-side, so an injected
 * reviewer could exfiltrate private code through an image URL; image syntax and
 * media tags are removed. Mentions are defused so output can't ping people.
 */
export function sanitizeMarkdown(text: string): string {
  // Removing one tag can join its neighbours into another, so repeat until stable.
  let current = text;
  for (let previous = ""; current !== previous;) {
    previous = current;
    current = stripMedia(current);
  }
  return current.replace(/@(?=[A-Za-z0-9])/g, "@​");
}
