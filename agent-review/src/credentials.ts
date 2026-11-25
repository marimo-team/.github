const credentialPatterns: ReadonlyArray<readonly [string, RegExp]> = [
  ["a GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ["a GitHub token", /\bgithub_pat_[A-Za-z0-9_]{30,}/],
  ["a JSON Web Token", /\beyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]+/],
  ["an Anthropic key", /\bsk-ant-[\w-]{20,}/],
  ["an OpenAI key", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/],
  ["a Logfire token", /\bpylf_v\d+_[a-z]+_[\w-]{20,}/],
  ["a Grafana token", /\bglc_[A-Za-z0-9+/]{32,}/],
  ["a Grafana token", /\bglsa_[A-Za-z0-9]{32}_[0-9a-f]{8}\b/],
  ["a private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

/**
 * Names the kind of credential `text` contains, if any. Codex can run read-only shell
 * commands in a job whose environment holds Actions tokens, so a prompt-injected agent
 * could print one into a finding. This catches tokens printed verbatim, not encoded ones.
 */
export function findCredential(text: string): string | undefined {
  return credentialPatterns.find(([, pattern]) => pattern.test(text))?.[0];
}
