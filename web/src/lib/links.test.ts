import { describe, expect, it } from "vitest";
import {
  createSubscriptionUrl,
  readAppendValues,
  readSubscriptionValues,
  replaceSubscriptions,
} from "./links";

describe("subscription links", () => {
  it("prefills query values without losing nested queries, unicode or repeated subscriptions", () => {
    const params = new URLSearchParams({
      config: "https://example.com/配置.yaml?key=a+b&version=2",
      extra: "https://example.com/extra.yaml",
      token: " a+b&?#令牌 ",
    });
    const values = readSubscriptionValues(`?${params}`);
    expect(values).toEqual(Object.fromEntries(params));
    const result = createSubscriptionUrl("https://worker.example", values);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a valid link");
    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe("https://worker.example/sub");
    expect([...url.searchParams]).toEqual([...params]);

    const appendParams = new URLSearchParams({ baseLink: result.url });
    appendParams.append("subs", "https://upstream.example/sub?key=a+b&n=2");
    appendParams.append("subs", "https://upstream.example/sub-b");
    expect(readAppendValues(appendParams.toString())).toEqual({
      baseLink: result.url,
      subs: "https://upstream.example/sub?key=a+b&n=2\nhttps://upstream.example/sub-b",
    });
  });

  it("defaults absent query parameters to empty fields", () => {
    expect(readSubscriptionValues("")).toEqual({
      config: "",
      extra: "",
      token: "",
    });
    expect(readAppendValues("")).toEqual({ baseLink: "", subs: "" });
  });

  it("trims URL fields while preserving the exact token", () => {
    const result = createSubscriptionUrl("http://localhost:5173", {
      config: "  https://example.com/config.yaml  ",
      extra: " https://example.com/extra.yaml ",
      token: " token ",
    });
    if (!result.ok) throw new Error("Expected a valid link");
    const url = new URL(result.url);
    expect(url.origin).toBe("http://localhost:5173");
    expect(url.searchParams.get("config")).toBe(
      "https://example.com/config.yaml",
    );
    expect(url.searchParams.get("extra")).toBe(
      "https://example.com/extra.yaml",
    );
    expect(url.searchParams.get("token")).toBe(" token ");
  });

  it("reports all invalid fields before creating a link", () => {
    const result = createSubscriptionUrl("https://worker.example", {
      config: "http://example.com/config.yaml",
      extra: "not a url",
      token: "  ",
    });
    expect(result).toEqual({
      ok: false,
      errors: {
        config: "链接须以 https:// 开头",
        extra: "请输入完整、有效的 URL",
        token: "请填写访问令牌",
      },
    });
  });
});

describe("extra subscriptions", () => {
  const baseLink =
    "https://other.example:8443/custom/sub?config=c&extra=e&token=a%2Bb&subs=old&flag=one&flag=two&subs=older#keep";

  it("replaces existing subs while preserving origin, path, unrelated parameters and fragment", () => {
    const result = replaceSubscriptions({
      baseLink,
      subs: " https://example.com/a?key=a+b&v=2 \r\n\r\nhttps://example.com/b\nhttps://example.com/b\n",
    });
    if (!result.ok) throw new Error("Expected a valid link");
    const url = new URL(result.url);
    expect(url.origin + url.pathname + url.hash).toBe(
      "https://other.example:8443/custom/sub#keep",
    );
    expect(url.searchParams.get("config")).toBe("c");
    expect(url.searchParams.get("extra")).toBe("e");
    expect(url.searchParams.get("token")).toBe("a+b");
    expect(url.searchParams.getAll("flag")).toEqual(["one", "two"]);
    expect(url.searchParams.getAll("subs")).toEqual([
      "https://example.com/a?key=a+b&v=2",
      "https://example.com/b",
      "https://example.com/b",
    ]);
  });

  it("clears subscriptions for an empty list and supports HTTP base links", () => {
    const result = replaceSubscriptions({
      baseLink: baseLink.replace("https:", "http:"),
      subs: " \r\n\n",
    });
    if (!result.ok) throw new Error("Expected a valid link");
    const url = new URL(result.url);
    expect(url.protocol).toBe("http:");
    expect(url.searchParams.has("subs")).toBe(false);
    expect(url.searchParams.get("token")).toBe("a+b");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,test",
    "/sub?token=a",
    "bad url",
    "",
  ])("rejects an invalid or unsafe base link: %s", (baseLink) => {
    const result = replaceSubscriptions({ baseLink, subs: "" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected validation to fail");
    expect(result.errors.baseLink).toBeTruthy();
  });

  it("identifies the original line number of an invalid extra subscription", () => {
    expect(
      replaceSubscriptions({
        baseLink,
        subs: "https://example.com/a\n\n http://example.com/b ",
      }),
    ).toEqual({
      ok: false,
      errors: { subs: "第 3 行：链接须以 https:// 开头" },
    });
  });
});
