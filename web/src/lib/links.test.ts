import { describe, expect, it } from "vitest";
import {
  createSubscriptionUrl,
  parseSubscriptionUrl,
  readSubscriptionValues,
} from "./links";

const fields = {
  config: "https://example.com/配置.yaml?key=a+b&next=%2Fconfig&version=2",
  extra: "https://example.com/extra.yaml",
  token: " a+b&?#令牌%2B ",
};
const subscriptions = [
  "https://upstream.example/sub?key=a+b&next=%2Fpath&n=2",
  "https://upstream.example/订阅",
  "https://upstream.example/订阅",
];

function queryWithSubscriptions() {
  const params = new URLSearchParams(fields);
  for (const subscription of subscriptions) params.append("subs", subscription);
  return params;
}

describe("subscription links", () => {
  it("prefills nested queries, unicode, exact tokens and repeated subscriptions", () => {
    const params = queryWithSubscriptions();
    const values = readSubscriptionValues(`?${params}`);
    expect(values).toEqual({ ...fields, subs: subscriptions.join("\n") });
    const result = createSubscriptionUrl("https://worker.example", values);
    if (!result.ok) throw new Error("Expected a valid link");
    expect(result.url).toBe(`https://worker.example/sub?${params}`);
  });

  it("defaults absent query parameters to empty fields", () => {
    expect(readSubscriptionValues("")).toEqual({
      config: "",
      extra: "",
      token: "",
      subs: "",
    });
  });

  it("trims URL fields while preserving the exact token", () => {
    const result = createSubscriptionUrl("http://localhost:5173", {
      config: "  https://example.com/config.yaml  ",
      extra: " https://example.com/extra.yaml ",
      token: " token ",
      subs: "",
    });
    if (!result.ok) throw new Error("Expected a valid link");
    const url = new URL(result.url);
    expect(url.origin).toBe("http://localhost:5173");
    expect(url.searchParams.get("config")).toBe("https://example.com/config.yaml");
    expect(url.searchParams.get("extra")).toBe("https://example.com/extra.yaml");
    expect(url.searchParams.get("token")).toBe(" token ");
    expect(url.searchParams.has("subs")).toBe(false);
  });

  it("reports all invalid fields and the original subscription line number", () => {
    expect(
      createSubscriptionUrl("https://worker.example", {
        config: "http://example.com/config.yaml",
        extra: "not a url",
        token: "  ",
        subs: "https://example.com/a\n\n http://example.com/b \ninvalid",
      }),
    ).toEqual({
      ok: false,
      errors: {
        config: "链接须以 https:// 开头",
        extra: "请输入完整、有效的 URL",
        subs: "第 3 行：链接须以 https:// 开头",
      },
    });
  });

  it("ignores blank lines and trims subscriptions while retaining order and duplicates", () => {
    const result = createSubscriptionUrl("https://worker.example", {
      ...fields,
      subs: " https://example.com/a?key=a+b&v=2 \r\n\r\nhttps://example.com/b\nhttps://example.com/b\n",
    });
    if (!result.ok) throw new Error("Expected a valid link");
    expect(new URL(result.url).searchParams.getAll("subs")).toEqual([
      "https://example.com/a?key=a+b&v=2",
      "https://example.com/b",
      "https://example.com/b",
    ]);
  });

  it("omits subscriptions when the input only contains whitespace", () => {
    const result = createSubscriptionUrl("https://worker.example", {
      ...fields,
      subs: " \r\n\n",
    });
    if (!result.ok) throw new Error("Expected a valid link");
    expect(new URL(result.url).searchParams.has("subs")).toBe(false);
  });
});

describe("importing generated links", () => {
  it.each(["http", "https"])(
    "imports %s links and regenerates on the current origin without double decoding",
    (protocol) => {
      const params = queryWithSubscriptions();
      const parsed = parseSubscriptionUrl(
        `  ${protocol}://old.example:8443/custom/sub?${params}&flag=old#fragment  `,
      );
      expect(parsed).toEqual({
        ok: true,
        values: { ...fields, subs: subscriptions.join("\n") },
      });
      if (!parsed.ok) throw new Error("Expected import to succeed");
      const result = createSubscriptionUrl("https://current.example", parsed.values);
      expect(result).toEqual({
        ok: true,
        url: `https://current.example/sub?${params}`,
      });
      if (!result.ok) throw new Error("Expected a valid link");
      expect(parseSubscriptionUrl(result.url)).toEqual(parsed);
    },
  );

  it("fills empty optional fields when the old link has no token or subs", () => {
    const params = new URLSearchParams(fields);
    params.delete("token");
    expect(
      parseSubscriptionUrl(`https://old.example/sub?${params}`),
    ).toEqual({ ok: true, values: { ...fields, token: "", subs: "" } });
  });

  it.each(["config", "extra"])(
    "reports a missing %s parameter before importing",
    (parameter) => {
      const params = new URLSearchParams(fields);
      params.delete(parameter);
      expect(parseSubscriptionUrl(`https://old.example/sub?${params}`)).toEqual({
        ok: false,
        error: `链接缺少必要参数：${parameter}`,
      });
    },
  );

  it.each([
    "",
    "bad url",
    "/sub?config=c&extra=e&token=t",
    "javascript:alert(1)?config=c&extra=e&token=t",
    "data:text/plain,test?config=c&extra=e&token=t",
    "ftp://example.com/sub?config=c&extra=e&token=t",
    "https://example.com/sub",
  ])("rejects invalid or unrelated links: %s", (link) => {
    expect(parseSubscriptionUrl(link).ok).toBe(false);
  });

  it("allows correcting imported field values before generation", () => {
    const parsed = parseSubscriptionUrl(
      "https://old.example/sub?config=http%3A%2F%2Fexample.com%2Fc&extra=invalid&token=&subs=invalid",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("Expected import to succeed");
    expect(createSubscriptionUrl("https://current.example", parsed.values)).toEqual({
      ok: false,
      errors: {
        config: "链接须以 https:// 开头",
        extra: "请输入完整、有效的 URL",
        subs: "第 1 行：请输入完整、有效的 URL",
      },
    });
  });
});
