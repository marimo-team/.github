import { deepEqual as assertEquals } from "node:assert/strict";
import { findCredential } from "./credentials.ts";

Deno.test("finds credentials printed verbatim", () => {
  const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJyZXBvOm8vciJ9.c2lnbmF0dXJl";
  assertEquals(findCredential(`token: ${jwt}`), "a JSON Web Token");
  assertEquals(findCredential(`ghs_${"a".repeat(36)}`), "a GitHub token");
  assertEquals(findCredential(`"github_pat_${"A1_".repeat(20)}"`), "a GitHub token");
  assertEquals(findCredential(`sk-ant-oat01-${"x".repeat(40)}`), "an Anthropic key");
  assertEquals(findCredential(`sk-proj-${"x".repeat(48)}`), "an OpenAI key");
  assertEquals(findCredential("-----BEGIN RSA PRIVATE KEY-----"), "a private key");
});

Deno.test("ignores ordinary review text", () => {
  for (
    const text of [
      "Read GITHUB_TOKEN from the environment instead of hardcoding ghs_ tokens.",
      "The header starts with eyJ when base64 encodes a JSON object.",
      "Use scikit-learn's sk-learn style naming; see task-ask-ant-colony.",
      "-----BEGIN PUBLIC KEY-----",
    ]
  ) {
    assertEquals(findCredential(text), undefined, text);
  }
});
