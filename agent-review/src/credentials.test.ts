import { deepEqual } from "node:assert/strict";
import { findCredential } from "./credentials.ts";

Deno.test("finds credentials printed verbatim", () => {
  const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJyZXBvOm8vciJ9.c2lnbmF0dXJl";
  deepEqual(findCredential(`token: ${jwt}`), "a JSON Web Token");
  deepEqual(findCredential(`ghs_${"a".repeat(36)}`), "a GitHub token");
  deepEqual(findCredential(`"github_pat_${"A1_".repeat(20)}"`), "a GitHub token");
  deepEqual(findCredential(`sk-ant-oat01-${"x".repeat(40)}`), "an Anthropic key");
  deepEqual(findCredential(`sk-proj-${"x".repeat(48)}`), "an OpenAI key");
  deepEqual(findCredential(`pylf_v1_us_${"Ab3".repeat(15)}`), "a Logfire token");
  deepEqual(findCredential(`glc_eyJvIjoi${"Ab3+".repeat(10)}`), "a Grafana token");
  deepEqual(findCredential(`glsa_${"Ab3d".repeat(8)}_0123abcd`), "a Grafana token");
  deepEqual(findCredential("-----BEGIN RSA PRIVATE KEY-----"), "a private key");
});

Deno.test("ignores ordinary review text", () => {
  for (
    const text of [
      "Read GITHUB_TOKEN from the environment instead of hardcoding ghs_ tokens.",
      "The header starts with eyJ when base64 encodes a JSON object.",
      "Use scikit-learn's sk-learn style naming; see task-ask-ant-colony.",
      "-----BEGIN PUBLIC KEY-----",
      "Logfire tokens look like pylf_v1_us_...",
      "Grafana access policy tokens start with glc_ and service accounts with glsa_.",
    ]
  ) {
    deepEqual(findCredential(text), undefined, text);
  }
});
