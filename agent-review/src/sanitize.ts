const mediaTag = /<\s*\/?\s*(?:img|picture|source|video|audio|iframe|object|embed)\b[^>]*>/gi;

/**
 * Model output is untrusted. GitHub fetches images server-side, so an injected
 * reviewer could exfiltrate private code through an image URL; image syntax and
 * media tags are removed. Mentions are defused so output can't ping people.
 */
export function sanitizeMarkdown(text: string): string {
  return text
    .replace(mediaTag, "")
    .replaceAll("![", "[")
    .replace(/@(?=[A-Za-z0-9])/g, "@\u200b");
}
