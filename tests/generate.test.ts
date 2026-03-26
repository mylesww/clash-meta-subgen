import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { generateClashYaml } from "../src/lib/generate";

describe("generateClashYaml", () => {
  it("builds proxies, proxy groups and rules", async () => {
    const configYaml = `
subs:
  - url: https://example.com/sub
    tag: alpha
ruleSets:
  - policy: 🎯 全球直连
    source:
      type: remote
      url: https://example.com/direct.list
  - policy: 🐟 漏网之鱼
    source:
      type: final
proxyGroups:
  - name: 🚀 节点选择
    type: select
    members:
      - type: nodeMatch
        pattern: ".*"
      - type: builtin
        name: DIRECT
  - name: 🇭🇰 香港节点
    type: url-test
    test:
      url: http://www.gstatic.com/generate_204
      interval: 120
      tolerance: 20
    members:
      - type: nodeMatch
        pattern: "hk"
`;

    const extraYaml = `
port: 7890
mode: Rule
`;

    const clashSubscription = `
proxies:
  - name: hk
    type: ss
    server: hk.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;

    const ruleList = `
DOMAIN-SUFFIX,example.com
GEOIP,CN,no-resolve
`;

    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      const bodyMap = new Map<string, string>([
        ["https://example.com/config.yaml", configYaml],
        ["https://example.com/extra.yaml", extraYaml],
        ["https://example.com/sub", clashSubscription],
        ["https://example.com/direct.list", ruleList],
      ]);

      const body = bodyMap.get(url);
      if (!body) {
        return new Response("not found", { status: 404 });
      }

      return new Response(body, { status: 200 });
    };

    const output = await generateClashYaml({
      configUrl: "https://example.com/config.yaml",
      extraUrl: "https://example.com/extra.yaml",
      fetchFn,
    });

    const parsed = parseYaml(output) as Record<string, unknown>;
    const proxies = parsed.proxies as Array<Record<string, unknown>>;
    const proxyGroups = parsed["proxy-groups"] as Array<Record<string, unknown>>;
    const rules = parsed.rules as string[];

    expect(parsed.port).toBe(7890);
    expect(proxies[0].name).toBe("hk");
    expect(proxyGroups[0].proxies).toContain("hk");
    expect(proxyGroups[1].proxies).toEqual(["hk"]);
    expect(rules).toContain("DOMAIN-SUFFIX,example.com,🎯 全球直连");
    expect(rules).toContain("GEOIP,CN,🎯 全球直连,no-resolve");
    expect(rules).toContain("MATCH,🐟 漏网之鱼");
  });

  it("ignores full-line and trailing hash comments in remote rule lists", async () => {
    const configYaml = `
subs:
  - url: https://example.com/sub
    tag: alpha
ruleSets:
  - policy: 🎯 全球直连
    source:
      type: remote
      url: https://example.com/direct.list
proxyGroups:
  - name: 🚀 节点选择
    type: select
    members:
      - type: nodeMatch
        pattern: ".*"
`;

    const extraYaml = "mode: Rule\n";
    const clashSubscription = `
proxies:
  - name: hk
    type: ss
    server: hk.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;

    const ruleList = `
# full line comment
DOMAIN-SUFFIX,example.com # trailing comment
DOMAIN-REGEX,^abc#def$
`;

    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      const bodyMap = new Map<string, string>([
        ["https://example.com/config.yaml", configYaml],
        ["https://example.com/extra.yaml", extraYaml],
        ["https://example.com/sub", clashSubscription],
        ["https://example.com/direct.list", ruleList],
      ]);

      const body = bodyMap.get(url);
      if (!body) {
        return new Response("not found", { status: 404 });
      }

      return new Response(body, { status: 200 });
    };

    const output = await generateClashYaml({
      configUrl: "https://example.com/config.yaml",
      extraUrl: "https://example.com/extra.yaml",
      fetchFn,
    });

    const parsed = parseYaml(output) as Record<string, unknown>;
    const rules = parsed.rules as string[];

    expect(rules).toContain("DOMAIN-SUFFIX,example.com,🎯 全球直连");
    expect(rules).toContain("DOMAIN-REGEX,^abc#def$,🎯 全球直连");
    expect(rules).toHaveLength(2);
  });

  it("rejects non-node members inside url-test groups", async () => {
    const configYaml = `
subs:
  - url: https://example.com/sub
    tag: alpha
ruleSets: []
proxyGroups:
  - name: 🇭🇰 香港节点
    type: url-test
    test:
      url: http://www.gstatic.com/generate_204
      interval: 120
      tolerance: 20
    members:
      - type: builtin
        name: DIRECT
`;

    const extraYaml = "mode: Rule\n";
    const clashSubscription = `
proxies:
  - name: hk
    type: ss
    server: hk.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;

    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      const bodyMap = new Map<string, string>([
        ["https://example.com/config.yaml", configYaml],
        ["https://example.com/extra.yaml", extraYaml],
        ["https://example.com/sub", clashSubscription],
      ]);

      const body = bodyMap.get(url);
      if (!body) {
        return new Response("not found", { status: 404 });
      }

      return new Response(body, { status: 200 });
    };

    await expect(
      generateClashYaml({
        configUrl: "https://example.com/config.yaml",
        extraUrl: "https://example.com/extra.yaml",
        fetchFn,
      }),
    ).rejects.toThrow(/non-node members/i);
  });

  it("adds tag only when proxy names collide", async () => {
    const configYaml = `
subs:
  - url: https://example.com/sub-a
    tag: alpha
  - url: https://example.com/sub-b
    tag: beta
ruleSets: []
proxyGroups:
  - name: 🚀 节点选择
    type: select
    members:
      - type: nodeMatch
        pattern: ".*"
`;

    const extraYaml = "mode: Rule\n";
    const clashSubscriptionA = `
proxies:
  - name: hk
    type: ss
    server: hk-a.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;
    const clashSubscriptionB = `
proxies:
  - name: hk
    type: ss
    server: hk-b.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;

    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      const bodyMap = new Map<string, string>([
        ["https://example.com/config.yaml", configYaml],
        ["https://example.com/extra.yaml", extraYaml],
        ["https://example.com/sub-a", clashSubscriptionA],
        ["https://example.com/sub-b", clashSubscriptionB],
      ]);

      const body = bodyMap.get(url);
      if (!body) {
        return new Response("not found", { status: 404 });
      }

      return new Response(body, { status: 200 });
    };

    const output = await generateClashYaml({
      configUrl: "https://example.com/config.yaml",
      extraUrl: "https://example.com/extra.yaml",
      fetchFn,
    });

    const parsed = parseYaml(output) as Record<string, unknown>;
    const proxies = parsed.proxies as Array<Record<string, unknown>>;

    expect(proxies.map((proxy) => proxy.name)).toEqual(["hk", "beta-hk"]);
  });

  it("excludes proxies by source-level name regex before renaming", async () => {
    const configYaml = `
subs:
  - url: https://example.com/sub
    tag: alpha
    exclude: "(试用|过期)"
ruleSets: []
proxyGroups:
  - name: 🚀 节点选择
    type: select
    members:
      - type: nodeMatch
        pattern: ".*"
`;

    const extraYaml = "mode: Rule\n";
    const clashSubscription = `
proxies:
  - name: 香港A
    type: ss
    server: hk-a.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
  - name: 香港试用
    type: ss
    server: hk-b.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;

    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      const bodyMap = new Map<string, string>([
        ["https://example.com/config.yaml", configYaml],
        ["https://example.com/extra.yaml", extraYaml],
        ["https://example.com/sub", clashSubscription],
      ]);

      const body = bodyMap.get(url);
      if (!body) {
        return new Response("not found", { status: 404 });
      }

      return new Response(body, { status: 200 });
    };

    const output = await generateClashYaml({
      configUrl: "https://example.com/config.yaml",
      extraUrl: "https://example.com/extra.yaml",
      fetchFn,
    });

    const parsed = parseYaml(output) as Record<string, unknown>;
    const proxies = parsed.proxies as Array<Record<string, unknown>>;
    const proxyGroups = parsed["proxy-groups"] as Array<Record<string, unknown>>;

    expect(proxies.map((proxy) => proxy.name)).toEqual(["香港A"]);
    expect(proxyGroups[0].proxies).toEqual(["香港A"]);
  });

  it("merges extra subs passed from the request with config subs", async () => {
    const configYaml = `
subs:
  - url: https://example.com/sub-a
    tag: alpha
ruleSets: []
proxyGroups:
  - name: 🚀 节点选择
    type: select
    members:
      - type: nodeMatch
        pattern: ".*"
`;

    const extraYaml = "mode: Rule\n";
    const clashSubscriptionA = `
proxies:
  - name: hk
    type: ss
    server: hk-a.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;
    const clashSubscriptionB = `
proxies:
  - name: us
    type: ss
    server: us.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;

    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      const bodyMap = new Map<string, string>([
        ["https://example.com/config.yaml", configYaml],
        ["https://example.com/extra.yaml", extraYaml],
        ["https://example.com/sub-a", clashSubscriptionA],
        ["https://example.com/sub-b", clashSubscriptionB],
      ]);

      const body = bodyMap.get(url);
      if (!body) {
        return new Response("not found", { status: 404 });
      }

      return new Response(body, { status: 200 });
    };

    const output = await generateClashYaml({
      configUrl: "https://example.com/config.yaml",
      extraUrl: "https://example.com/extra.yaml",
      extraSubs: [{ url: "https://example.com/sub-b", tag: "extra1" }],
      fetchFn,
    });

    const parsed = parseYaml(output) as Record<string, unknown>;
    const proxies = parsed.proxies as Array<Record<string, unknown>>;
    const proxyGroups = parsed["proxy-groups"] as Array<Record<string, unknown>>;

    expect(proxies.map((proxy) => proxy.name)).toEqual(["hk", "us"]);
    expect(proxyGroups[0].proxies).toEqual(["hk", "us"]);
  });

  it("applies top-level exclude to all imported proxy names", async () => {
    const configYaml = `
subs:
  - url: https://example.com/sub-a
    tag: alpha
  - url: https://example.com/sub-b
    tag: beta
exclude: "(试用|过期)"
ruleSets: []
proxyGroups:
  - name: 🚀 节点选择
    type: select
    members:
      - type: nodeMatch
        pattern: ".*"
`;

    const extraYaml = "mode: Rule\n";
    const clashSubscriptionA = `
proxies:
  - name: 香港A
    type: ss
    server: hk-a.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
  - name: 香港试用
    type: ss
    server: hk-b.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;
    const clashSubscriptionB = `
proxies:
  - name: 美国过期
    type: ss
    server: us-a.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
  - name: 美国A
    type: ss
    server: us-b.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;

    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      const bodyMap = new Map<string, string>([
        ["https://example.com/config.yaml", configYaml],
        ["https://example.com/extra.yaml", extraYaml],
        ["https://example.com/sub-a", clashSubscriptionA],
        ["https://example.com/sub-b", clashSubscriptionB],
      ]);

      const body = bodyMap.get(url);
      if (!body) {
        return new Response("not found", { status: 404 });
      }

      return new Response(body, { status: 200 });
    };

    const output = await generateClashYaml({
      configUrl: "https://example.com/config.yaml",
      extraUrl: "https://example.com/extra.yaml",
      fetchFn,
    });

    const parsed = parseYaml(output) as Record<string, unknown>;
    const proxies = parsed.proxies as Array<Record<string, unknown>>;
    const proxyGroups = parsed["proxy-groups"] as Array<Record<string, unknown>>;

    expect(proxies.map((proxy) => proxy.name)).toEqual(["香港A", "美国A"]);
    expect(proxyGroups[0].proxies).toEqual(["香港A", "美国A"]);
  });

  it("excludes nodeMatch candidates by source tag", async () => {
    const configYaml = `
subs:
  - url: https://example.com/sub-a
    tag: provider-a
  - url: https://example.com/sub-b
    tag: provider-b
ruleSets: []
proxyGroups:
  - name: 🇭🇰 香港节点
    type: select
    members:
      - type: nodeMatch
        pattern: "hk"
        excludeTags:
          - provider-b
`;

    const extraYaml = "mode: Rule\n";
    const clashSubscriptionA = `
proxies:
  - name: hk-a
    type: ss
    server: hk-a.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;
    const clashSubscriptionB = `
proxies:
  - name: hk-b
    type: ss
    server: hk-b.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;

    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      const bodyMap = new Map<string, string>([
        ["https://example.com/config.yaml", configYaml],
        ["https://example.com/extra.yaml", extraYaml],
        ["https://example.com/sub-a", clashSubscriptionA],
        ["https://example.com/sub-b", clashSubscriptionB],
      ]);

      const body = bodyMap.get(url);
      if (!body) {
        return new Response("not found", { status: 404 });
      }

      return new Response(body, { status: 200 });
    };

    const output = await generateClashYaml({
      configUrl: "https://example.com/config.yaml",
      extraUrl: "https://example.com/extra.yaml",
      fetchFn,
    });

    const parsed = parseYaml(output) as Record<string, unknown>;
    const proxyGroups = parsed["proxy-groups"] as Array<Record<string, unknown>>;

    expect(proxyGroups[0].proxies).toEqual(["hk-a"]);
  });

  it("keeps nodeMatch behavior unchanged when excludeTags is omitted", async () => {
    const configYaml = `
subs:
  - url: https://example.com/sub-a
    tag: provider-a
  - url: https://example.com/sub-b
    tag: provider-b
ruleSets: []
proxyGroups:
  - name: 🇭🇰 香港节点
    type: select
    members:
      - type: nodeMatch
        pattern: "hk"
`;

    const extraYaml = "mode: Rule\n";
    const clashSubscriptionA = `
proxies:
  - name: hk-a
    type: ss
    server: hk-a.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;
    const clashSubscriptionB = `
proxies:
  - name: hk-b
    type: ss
    server: hk-b.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;

    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      const bodyMap = new Map<string, string>([
        ["https://example.com/config.yaml", configYaml],
        ["https://example.com/extra.yaml", extraYaml],
        ["https://example.com/sub-a", clashSubscriptionA],
        ["https://example.com/sub-b", clashSubscriptionB],
      ]);

      const body = bodyMap.get(url);
      if (!body) {
        return new Response("not found", { status: 404 });
      }

      return new Response(body, { status: 200 });
    };

    const output = await generateClashYaml({
      configUrl: "https://example.com/config.yaml",
      extraUrl: "https://example.com/extra.yaml",
      fetchFn,
    });

    const parsed = parseYaml(output) as Record<string, unknown>;
    const proxyGroups = parsed["proxy-groups"] as Array<Record<string, unknown>>;

    expect(proxyGroups[0].proxies).toEqual(["hk-a", "hk-b"]);
  });

  it("uses the real source tag for excludeTags when names collide", async () => {
    const configYaml = `
subs:
  - url: https://example.com/sub-a
    tag: provider-a
  - url: https://example.com/sub-b
    tag: provider-b
ruleSets: []
proxyGroups:
  - name: 🇭🇰 香港节点
    type: select
    members:
      - type: nodeMatch
        pattern: "hk"
        excludeTags:
          - provider-b
`;

    const extraYaml = "mode: Rule\n";
    const clashSubscriptionA = `
proxies:
  - name: hk
    type: ss
    server: hk-a.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;
    const clashSubscriptionB = `
proxies:
  - name: hk
    type: ss
    server: hk-b.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;

    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      const bodyMap = new Map<string, string>([
        ["https://example.com/config.yaml", configYaml],
        ["https://example.com/extra.yaml", extraYaml],
        ["https://example.com/sub-a", clashSubscriptionA],
        ["https://example.com/sub-b", clashSubscriptionB],
      ]);

      const body = bodyMap.get(url);
      if (!body) {
        return new Response("not found", { status: 404 });
      }

      return new Response(body, { status: 200 });
    };

    const output = await generateClashYaml({
      configUrl: "https://example.com/config.yaml",
      extraUrl: "https://example.com/extra.yaml",
      fetchFn,
    });

    const parsed = parseYaml(output) as Record<string, unknown>;
    const proxies = parsed.proxies as Array<Record<string, unknown>>;
    const proxyGroups = parsed["proxy-groups"] as Array<Record<string, unknown>>;

    expect(proxies.map((proxy) => proxy.name)).toEqual(["hk", "provider-b-hk"]);
    expect(proxyGroups[0].proxies).toEqual(["hk"]);
  });

  it("ignores unknown excludeTags without failing", async () => {
    const configYaml = `
subs:
  - url: https://example.com/sub-a
    tag: provider-a
ruleSets: []
proxyGroups:
  - name: 🇭🇰 香港节点
    type: select
    members:
      - type: nodeMatch
        pattern: "hk"
        excludeTags:
          - provider-b
`;

    const extraYaml = "mode: Rule\n";
    const clashSubscriptionA = `
proxies:
  - name: hk-a
    type: ss
    server: hk-a.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;

    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      const bodyMap = new Map<string, string>([
        ["https://example.com/config.yaml", configYaml],
        ["https://example.com/extra.yaml", extraYaml],
        ["https://example.com/sub-a", clashSubscriptionA],
      ]);

      const body = bodyMap.get(url);
      if (!body) {
        return new Response("not found", { status: 404 });
      }

      return new Response(body, { status: 200 });
    };

    const output = await generateClashYaml({
      configUrl: "https://example.com/config.yaml",
      extraUrl: "https://example.com/extra.yaml",
      fetchFn,
    });

    const parsed = parseYaml(output) as Record<string, unknown>;
    const proxyGroups = parsed["proxy-groups"] as Array<Record<string, unknown>>;

    expect(proxyGroups[0].proxies).toEqual(["hk-a"]);
  });
});
