export interface SubscriptionValues {
  config: string;
  extra: string;
  token: string;
  subs: string;
}

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

type LinkResult<T> =
  { ok: true; url: string } | { ok: false; errors: FieldErrors<T> };

export function readSubscriptionValues(search: string): SubscriptionValues {
  const params = new URLSearchParams(search);
  return {
    config: params.get("config") ?? "",
    extra: params.get("extra") ?? "",
    token: params.get("token") ?? "",
    subs: "",
  };
}

function urlError(value: string, allowHttp = false): string | undefined {
  if (!value.trim()) return "请填写链接";

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return "请输入完整、有效的 URL";
  }

  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) {
    return allowHttp
      ? "链接须以 http:// 或 https:// 开头"
      : "链接须以 https:// 开头";
  }
}

export function parseSubscriptionUrl(
  value: string,
): { ok: true; values: SubscriptionValues } | { ok: false; error: string } {
  const error = urlError(value, true);
  if (error) return { ok: false, error };

  const url = new URL(value.trim());
  const missing = ["config", "extra"].filter(
    (parameter) => !url.searchParams.has(parameter),
  );
  if (missing.length) {
    return {
      ok: false,
      error: `链接缺少必要参数：${missing.join("、")}`,
    };
  }

  return {
    ok: true,
    values: {
      ...readSubscriptionValues(url.search),
      subs: url.searchParams.getAll("subs").join("\n"),
    },
  };
}

export function createSubscriptionUrl(
  origin: string,
  values: SubscriptionValues,
): LinkResult<SubscriptionValues> {
  const errors: FieldErrors<SubscriptionValues> = {};
  const configError = urlError(values.config);
  const extraError = urlError(values.extra);
  if (configError) errors.config = configError;
  if (extraError) errors.extra = extraError;

  const subscriptions: string[] = [];
  for (const [index, line] of values.subs.split(/\r?\n/).entries()) {
    const subscription = line.trim();
    if (!subscription) continue;
    const error = urlError(subscription);
    if (error && !errors.subs) errors.subs = `第 ${index + 1} 行：${error}`;
    subscriptions.push(subscription);
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  const url = new URL("/sub", origin);
  url.searchParams.set("config", values.config.trim());
  url.searchParams.set("extra", values.extra.trim());
  // Tokens are opaque: preserve spaces and special characters exactly.
  if (values.token.trim()) url.searchParams.set("token", values.token);
  for (const subscription of subscriptions)
    url.searchParams.append("subs", subscription);
  return { ok: true, url: url.toString() };
}
