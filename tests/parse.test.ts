import { describe, expect, it } from "vitest";

import {
  parseConfigYaml,
  parseSubscriptionPayload,
  rewriteRuleLineWithPolicy,
  splitTopLevelCsv,
} from "../src/lib/parse";

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

describe("splitTopLevelCsv", () => {
  it("keeps commas inside logical rule payloads", () => {
    expect(splitTopLevelCsv("AND,((NETWORK,UDP),(DST-PORT,443))")).toEqual([
      "AND",
      "((NETWORK,UDP),(DST-PORT,443))",
    ]);
  });
});

describe("rewriteRuleLineWithPolicy", () => {
  it("injects policy before no-resolve", () => {
    expect(rewriteRuleLineWithPolicy("GEOIP,CN,no-resolve", "DIRECT")).toBe(
      "GEOIP,CN,DIRECT,no-resolve",
    );
  });

  it("appends policy for logical rules", () => {
    expect(rewriteRuleLineWithPolicy("AND,((NETWORK,UDP),(DST-PORT,443))", "REJECT")).toBe(
      "AND,((NETWORK,UDP),(DST-PORT,443)),REJECT",
    );
  });
});

describe("parseSubscriptionPayload", () => {
  it("parses clash yaml subscriptions", () => {
    const proxies = parseSubscriptionPayload(
      `
proxies:
  - name: hk-1
    type: ss
    server: example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`,
      "yaml",
    );

    expect(proxies).toHaveLength(1);
    expect(proxies[0].name).toBe("hk-1");
    expect(proxies[0].type).toBe("ss");
  });

  it("parses base64 vmess subscriptions", () => {
    const vmessJson = JSON.stringify({
      v: "2",
      ps: "vmess-node",
      add: "example.com",
      port: "443",
      id: "12345678-1234-1234-1234-1234567890ab",
      aid: "0",
      net: "ws",
      path: "/ws",
      host: "ws.example.com",
      tls: "tls",
    });
    const encoded = encodeBase64(`vmess://${encodeBase64(vmessJson)}`);

    const proxies = parseSubscriptionPayload(encoded, "vmess");

    expect(proxies).toHaveLength(1);
    expect(proxies[0].name).toBe("vmess-node");
    expect(proxies[0].type).toBe("vmess");
    expect(proxies[0].network).toBe("ws");
  });
});

describe("parseConfigYaml", () => {
  it("parses subs as the primary source field", () => {
    const config = parseConfigYaml(
      `
subs:
  - url: https://example.com/sub
    tag: alpha
ruleSets: []
proxyGroups: []
`,
      "config",
    );

    expect(config.subs).toEqual([{ url: "https://example.com/sub", tag: "alpha" }]);
  });

  it("rejects the legacy urls field", () => {
    expect(() =>
      parseConfigYaml(
        `
urls:
  - url: https://example.com/sub
    tag: alpha
ruleSets: []
proxyGroups: []
`,
        "config",
      ),
    ).toThrow(/config\.subs/i);
  });
});
