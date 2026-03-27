import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index";

describe("worker /sub response headers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards subscription metadata headers from the first subscription source that has them", async () => {
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

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        switch (url) {
          case "https://example.com/config.yaml":
            return new Response(configYaml, { status: 200 });
          case "https://example.com/extra.yaml":
            return new Response(extraYaml, { status: 200 });
          case "https://example.com/sub-a":
            return new Response(clashSubscriptionA, {
              status: 200,
            });
          case "https://example.com/sub-b":
            return new Response(clashSubscriptionB, {
              status: 200,
              headers: {
                "subscription-userinfo": "upload=9; download=9; total=9; expire=9",
                "profile-web-page-url": "https://portal-b.example.com",
              },
            });
          default:
            return new Response("not found", { status: 404 });
        }
      }),
    );
    vi.stubGlobal("caches", {
      default: {
        match: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
      },
    });

    const request = new Request(
      "https://worker.example/sub?token=secret&config=https://example.com/config.yaml&extra=https://example.com/extra.yaml",
    );

    const response = await worker.fetch(
      request,
      {
        ACCESS_TOKEN: "secret",
        RESULT_CACHE_TTL_SECONDS: "0",
      },
      {
        waitUntil: vi.fn(),
      } as unknown as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("subscription-userinfo")).toBe(
      "upload=9; download=9; total=9; expire=9",
    );
    expect(response.headers.get("profile-web-page-url")).toBe("https://portal-b.example.com");
    expect(response.headers.get("content-type")).toBe("text/yaml; charset=utf-8");
  });

  it("passes through clash user-agent to upstream subscriptions", async () => {
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
    const clashSubscription = `
proxies:
  - name: hk-a
    type: ss
    server: hk-a.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        switch (url) {
          case "https://example.com/config.yaml":
            return new Response(configYaml, { status: 200 });
          case "https://example.com/extra.yaml":
            return new Response(extraYaml, { status: 200 });
          case "https://example.com/sub-a": {
            const userAgent = new Headers(init?.headers).get("user-agent");
            return new Response(clashSubscription, {
              status: 200,
              headers:
                userAgent === "ClashforWindows/0.20.39"
                  ? {
                      "subscription-userinfo": "upload=1; download=2; total=3; expire=4",
                    }
                  : {},
            });
          }
          default:
            return new Response("not found", { status: 404 });
        }
      }),
    );
    vi.stubGlobal("caches", {
      default: {
        match: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
      },
    });

    const request = new Request(
      "https://worker.example/sub?token=secret&config=https://example.com/config.yaml&extra=https://example.com/extra.yaml",
      {
        headers: {
          "user-agent": "ClashforWindows/0.20.39",
          accept: "*/*",
        },
      },
    );

    const response = await worker.fetch(
      request,
      {
        ACCESS_TOKEN: "secret",
        RESULT_CACHE_TTL_SECONDS: "0",
      },
      {
        waitUntil: vi.fn(),
      } as unknown as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("subscription-userinfo")).toBe(
      "upload=1; download=2; total=3; expire=4",
    );
  });
});
