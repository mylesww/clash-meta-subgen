import { parse as parseYaml } from "yaml";

import { HttpError } from "./errors";
import type {
  ClashProxy,
  ConfigFile,
  GeoipRuleSource,
  GroupMember,
  JsonLike,
  ProxyGroupConfig,
  RuleSetConfig,
} from "./types";

const COMMENT_PREFIXES = ["#", ";", "//"];
const RESERVED_TOP_LEVEL_KEYS = new Set(["proxies", "proxy-groups", "rules"]);
const BUILTIN_NAMES = new Set(["DIRECT", "REJECT", "PASS"]);

export function assertHttpsUrl(value: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HttpError(400, `${label} must be a valid URL`);
  }

  if (parsed.protocol !== "https:") {
    throw new HttpError(400, `${label} must use https`);
  }

  return parsed;
}

export async function fetchText(url: string, label: string, fetchFn: typeof fetch): Promise<string> {
  const { text } = await fetchTextWithHeaders(url, label, fetchFn);
  return text;
}

export async function fetchTextWithHeaders(
  url: string,
  label: string,
  fetchFn: typeof fetch,
  requestHeaders?: HeadersInit,
): Promise<{ text: string; headers: Headers }> {
  const headers = new Headers({
    "User-Agent": "clash-meta-subgen/0.1.0",
    Accept: "*/*",
  });
  if (requestHeaders) {
    new Headers(requestHeaders).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  const response = await fetchFn(url, {
    headers,
  });

  if (!response.ok) {
    throw new HttpError(502, `Failed to fetch ${label}: ${response.status} ${response.statusText}`);
  }

  return {
    text: await response.text(),
    headers: response.headers,
  };
}

export function parseConfigYaml(text: string, label: string): ConfigFile {
  let parsed: unknown;
  try {
    parsed = parseYaml(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid yaml";
    throw new HttpError(400, `${label} is not valid YAML: ${message}`);
  }
  assertPlainObject(parsed, label);

  const subs = asArray(parsed.subs, `${label}.subs`).map((item, index) => {
    assertPlainObject(item, `${label}.subs[${index}]`);
    return {
      url: asString(item.url, `${label}.subs[${index}].url`),
      tag: asString(item.tag, `${label}.subs[${index}].tag`),
      exclude:
        item.exclude === undefined
          ? undefined
          : asString(item.exclude, `${label}.subs[${index}].exclude`),
    };
  });
  const exclude = parsed.exclude === undefined ? undefined : asString(parsed.exclude, `${label}.exclude`);

  const ruleSets = asArray(parsed.ruleSets, `${label}.ruleSets`).map((item, index) =>
    parseRuleSet(item, `${label}.ruleSets[${index}]`),
  );

  const proxyGroups = asArray(parsed.proxyGroups, `${label}.proxyGroups`).map((item, index) =>
    parseProxyGroup(item, `${label}.proxyGroups[${index}]`),
  );

  return { subs, exclude, ruleSets, proxyGroups };
}

export function parseExtraYaml(text: string, label: string): JsonLike {
  let parsed: unknown;
  try {
    parsed = parseYaml(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid yaml";
    throw new HttpError(400, `${label} is not valid YAML: ${message}`);
  }
  assertPlainObject(parsed, label);
  for (const key of Object.keys(parsed)) {
    if (RESERVED_TOP_LEVEL_KEYS.has(key)) {
      throw new HttpError(400, `${label} must not define reserved top-level key: ${key}`);
    }
  }
  return parsed;
}

export function parseSubscriptionPayload(text: string, tag: string): ClashProxy[] {
  const clashProxies = tryParseClashYaml(text, tag);
  if (clashProxies) {
    return clashProxies;
  }

  const normalizedText = normalizeSubscriptionText(text);
  const lines = normalizedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isCommentLine(line));

  if (lines.length === 0) {
    throw new HttpError(502, `Subscription "${tag}" does not contain any nodes`);
  }

  return lines.map((line, index) => {
    try {
      return parseSubscriptionUri(line, tag, index);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : "invalid subscription line";
      throw new HttpError(502, `Failed to parse subscription line #${index + 1} for ${tag}: ${message}`);
    }
  });
}

export function splitTopLevelCsv(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (quote) {
      current += char;
      if (char === quote && input[index - 1] !== "\\") {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === "(") depthParen += 1;
    if (char === ")") depthParen = Math.max(0, depthParen - 1);
    if (char === "[") depthBracket += 1;
    if (char === "]") depthBracket = Math.max(0, depthBracket - 1);
    if (char === "{") depthBrace += 1;
    if (char === "}") depthBrace = Math.max(0, depthBrace - 1);

    if (char === "," && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
      tokens.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    tokens.push(current.trim());
  }

  return tokens;
}

export function rewriteRuleLineWithPolicy(rawLine: string, policy: string): string {
  const line = rawLine.trim();
  if (!line || isCommentLine(line)) {
    throw new HttpError(502, "Cannot rewrite an empty or comment rule line");
  }

  const tokens = splitTopLevelCsv(line);
  if (tokens.length === 0) {
    throw new HttpError(502, `Invalid rule line: ${line}`);
  }

  if (tokens.length === 1) {
    return `${tokens[0]},${policy}`;
  }

  let insertionIndex = tokens.length;
  while (insertionIndex > 2 && isTailModifierToken(tokens[insertionIndex - 1])) {
    insertionIndex -= 1;
  }

  if (insertionIndex < 2) {
    throw new HttpError(502, `Cannot place policy for rule line: ${line}`);
  }

  return [...tokens.slice(0, insertionIndex), policy, ...tokens.slice(insertionIndex)].join(",");
}

function parseRuleSet(value: unknown, label: string): RuleSetConfig {
  assertPlainObject(value, label);
  const policy = asString(value.policy, `${label}.policy`);
  assertPlainObject(value.source, `${label}.source`);

  const type = asString(value.source.type, `${label}.source.type`);
  switch (type) {
    case "remote":
      return {
        policy,
        source: {
          type,
          url: asString(value.source.url, `${label}.source.url`),
        },
      };
    case "geosite":
      return {
        policy,
        source: {
          type,
          value: asString(value.source.value, `${label}.source.value`),
        },
      };
    case "geoip":
      return {
        policy,
        source: {
          type,
          value: asString(value.source.value, `${label}.source.value`),
          noResolve:
            value.source.noResolve === undefined
              ? false
              : asBoolean(value.source.noResolve, `${label}.source.noResolve`),
        } satisfies GeoipRuleSource,
      };
    case "final":
      return {
        policy,
        source: { type },
      };
    default:
      throw new HttpError(400, `${label}.source.type is not supported: ${type}`);
  }
}

function parseProxyGroup(value: unknown, label: string): ProxyGroupConfig {
  assertPlainObject(value, label);
  const group: ProxyGroupConfig = {
    name: asString(value.name, `${label}.name`),
    type: asString(value.type, `${label}.type`),
    members: asArray(value.members, `${label}.members`).map((item, index) =>
      parseGroupMember(item, `${label}.members[${index}]`),
    ),
  };

  if (value.test !== undefined) {
    assertPlainObject(value.test, `${label}.test`);
    group.test = {
      url: asString(value.test.url, `${label}.test.url`),
      interval: asNumber(value.test.interval, `${label}.test.interval`),
      tolerance: asNumber(value.test.tolerance, `${label}.test.tolerance`),
    };
  }

  return group;
}

function parseGroupMember(value: unknown, label: string): GroupMember {
  assertPlainObject(value, label);
  const type = asString(value.type, `${label}.type`);

  switch (type) {
    case "group":
      return {
        type,
        name: asString(value.name, `${label}.name`),
      };
    case "builtin": {
      const name = asString(value.name, `${label}.name`);
      if (!BUILTIN_NAMES.has(name)) {
        throw new HttpError(400, `${label}.name is not a supported builtin: ${name}`);
      }
      return { type, name };
    }
    case "nodeMatch":
      return {
        type,
        pattern: asString(value.pattern, `${label}.pattern`),
        includeTags:
          value.includeTags === undefined
            ? undefined
            : asArray(value.includeTags, `${label}.includeTags`).map((item, index) =>
                asString(item, `${label}.includeTags[${index}]`),
              ),
        excludeTags:
          value.excludeTags === undefined
            ? undefined
            : asArray(value.excludeTags, `${label}.excludeTags`).map((item, index) =>
                asString(item, `${label}.excludeTags[${index}]`),
              ),
      };
    default:
      throw new HttpError(400, `${label}.type is not supported: ${type}`);
  }
}

function tryParseClashYaml(text: string, tag: string): ClashProxy[] | null {
  try {
    const parsed = parseYaml(text) as unknown;
    if (!isPlainObject(parsed) || !Array.isArray((parsed as JsonLike).proxies)) {
      return null;
    }

    return ((parsed as JsonLike).proxies as unknown[]).map((item, index) =>
      normalizeClashProxy(item, `${tag}.proxies[${index}]`),
    );
  } catch {
    return null;
  }
}

function normalizeSubscriptionText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (trimmed.includes("://")) {
    return trimmed;
  }

  if (/^[A-Za-z0-9+/=_-]+$/.test(trimmed)) {
    const decoded = decodeBase64Loose(trimmed);
    if (decoded.includes("://") || decoded.includes("\n")) {
      return decoded;
    }
  }

  return trimmed;
}

function parseSubscriptionUri(line: string, tag: string, index: number): ClashProxy {
  const schemeEnd = line.indexOf("://");
  if (schemeEnd === -1) {
    throw new HttpError(502, `Unsupported subscription line #${index + 1} for ${tag}`);
  }

  const scheme = line.slice(0, schemeEnd).toLowerCase();
  switch (scheme) {
    case "ss":
      return parseSsUri(line);
    case "ssr":
      return parseSsrUri(line);
    case "vmess":
      return parseVmessUri(line);
    case "vless":
      return parseVlessUri(line);
    case "trojan":
      return parseTrojanUri(line);
    case "hysteria":
      return parseHysteriaUri(line);
    case "hysteria2":
    case "hy2":
      return parseHysteria2Uri(line);
    case "tuic":
      return parseTuicUri(line);
    case "wireguard":
      return parseWireguardUri(line);
    default:
      throw new HttpError(502, `Unsupported subscription scheme "${scheme}" in ${tag}`);
  }
}

function parseSsUri(raw: string): ClashProxy {
  const [withoutFragment, hash = ""] = raw.split("#", 2);
  const name = decodeURIComponentSafe(hash) || "ss";
  const queryIndex = withoutFragment.indexOf("?");
  const mainPart = queryIndex === -1 ? withoutFragment : withoutFragment.slice(0, queryIndex);
  const queryString = queryIndex === -1 ? "" : withoutFragment.slice(queryIndex + 1);

  const payload = mainPart.slice("ss://".length);
  let server = "";
  let port = 0;
  let cipher = "";
  let password = "";

  if (payload.includes("@")) {
    const parsed = new URL(raw);
    server = parsed.hostname;
    port = Number(parsed.port);
    const decodedUser = decodeBase64Loose(parsed.username || "");
    if (decodedUser.includes(":")) {
      const colonIndex = decodedUser.indexOf(":");
      cipher = decodedUser.slice(0, colonIndex);
      password = decodedUser.slice(colonIndex + 1);
    } else {
      cipher = decodeURIComponentSafe(parsed.username);
      password = decodeURIComponentSafe(parsed.password);
    }
  } else {
    const decoded = decodeBase64Loose(payload);
    const atIndex = decoded.lastIndexOf("@");
    if (atIndex === -1) {
      throw new HttpError(502, `Invalid ss subscription: ${raw}`);
    }
    const userInfo = decoded.slice(0, atIndex);
    const hostInfo = decoded.slice(atIndex + 1);
    const colonIndex = userInfo.indexOf(":");
    if (colonIndex === -1) {
      throw new HttpError(502, `Invalid ss credentials: ${raw}`);
    }
    cipher = userInfo.slice(0, colonIndex);
    password = userInfo.slice(colonIndex + 1);
    const hostPort = hostInfo.match(/^(.*):(\d+)$/);
    if (!hostPort) {
      throw new HttpError(502, `Invalid ss host: ${raw}`);
    }
    server = hostPort[1];
    port = Number(hostPort[2]);
  }

  const proxy: ClashProxy = {
    name,
    type: "ss",
    server,
    port,
    cipher,
    password,
    udp: true,
  };

  const params = new URLSearchParams(queryString);
  const plugin = params.get("plugin");
  if (plugin) {
    const [pluginName, ...rest] = plugin.split(";");
    proxy.plugin = pluginName;
    const pluginOpts = Object.fromEntries(
      rest
        .map((part) => part.split("=", 2))
        .filter(([key]) => key),
    );
    if (Object.keys(pluginOpts).length > 0) {
      proxy["plugin-opts"] = pluginOpts;
    }
  }

  return proxy;
}

function parseSsrUri(raw: string): ClashProxy {
  const encoded = raw.slice("ssr://".length);
  const decoded = decodeBase64Loose(encoded);
  const [base, query = ""] = decoded.split("/?", 2);
  const parts = base.split(":");
  if (parts.length < 6) {
    throw new HttpError(502, `Invalid ssr subscription: ${raw}`);
  }

  const [server, portText, protocol, cipher, obfs, passwordEncoded] = parts;
  const params = new URLSearchParams(query);
  const name = decodeBase64Loose(params.get("remarks") ?? "") || "ssr";

  const proxy: ClashProxy = {
    name,
    type: "ssr",
    server,
    port: Number(portText),
    protocol,
    cipher,
    obfs,
    password: decodeBase64Loose(passwordEncoded),
    udp: true,
  };

  const protocolParam = params.get("protoparam");
  if (protocolParam) {
    proxy["protocol-param"] = decodeBase64Loose(protocolParam);
  }
  const obfsParam = params.get("obfsparam");
  if (obfsParam) {
    proxy["obfs-param"] = decodeBase64Loose(obfsParam);
  }

  return proxy;
}

function parseVmessUri(raw: string): ClashProxy {
  const encoded = raw.slice("vmess://".length);
  const decoded = decodeBase64Loose(encoded);
  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(decoded) as Record<string, string>;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid vmess json";
    throw new HttpError(502, `Invalid vmess subscription: ${message}`);
  }
  const network = parsed.net || parsed.type || "tcp";
  const proxy: ClashProxy = {
    name: parsed.ps || "vmess",
    type: "vmess",
    server: parsed.add,
    port: Number(parsed.port),
    uuid: parsed.id,
    alterId: Number(parsed.aid || "0"),
    cipher: parsed.scy || "auto",
    udp: true,
    tls: parsed.tls === "tls",
    servername: parsed.sni || undefined,
    "skip-cert-verify": parsed.allowInsecure === "1",
    network,
  };

  if (network === "ws") {
    proxy["ws-opts"] = {
      path: parsed.path || "/",
      headers: parsed.host ? { Host: parsed.host } : undefined,
    };
  } else if (network === "grpc") {
    proxy["grpc-opts"] = {
      "grpc-service-name": parsed.path || parsed.serviceName || "",
    };
  } else if (network === "h2") {
    proxy["h2-opts"] = {
      host: parsed.host ? [parsed.host] : undefined,
      path: parsed.path || "/",
    };
  } else if (network === "http") {
    proxy["http-opts"] = {
      path: [parsed.path || "/"],
      headers: parsed.host ? { Host: [parsed.host] } : undefined,
    };
  }

  return cleanupUndefined(proxy);
}

function parseVlessUri(raw: string): ClashProxy {
  const parsed = new URL(raw);
  const proxy: ClashProxy = {
    name: decodeURIComponentSafe(parsed.hash.slice(1)) || "vless",
    type: "vless",
    server: parsed.hostname,
    port: Number(parsed.port),
    uuid: decodeURIComponentSafe(parsed.username),
    udp: true,
    tls: isTlsEnabled(parsed),
    servername: parsed.searchParams.get("sni") ?? undefined,
    flow: parsed.searchParams.get("flow") ?? undefined,
    "skip-cert-verify": isTruthy(parsed.searchParams.get("insecure")),
    network: parsed.searchParams.get("type") ?? "tcp",
  };

  applyCommonTransportOptions(proxy, parsed);
  return cleanupUndefined(proxy);
}

function parseTrojanUri(raw: string): ClashProxy {
  const parsed = new URL(raw);
  const proxy: ClashProxy = {
    name: decodeURIComponentSafe(parsed.hash.slice(1)) || "trojan",
    type: "trojan",
    server: parsed.hostname,
    port: Number(parsed.port),
    password: decodeURIComponentSafe(parsed.username),
    udp: true,
    sni: parsed.searchParams.get("sni") ?? undefined,
    "skip-cert-verify": isTruthy(parsed.searchParams.get("allowInsecure")) || isTruthy(parsed.searchParams.get("insecure")),
    network: parsed.searchParams.get("type") ?? "tcp",
  };

  applyCommonTransportOptions(proxy, parsed);
  return cleanupUndefined(proxy);
}

function parseHysteriaUri(raw: string): ClashProxy {
  const parsed = new URL(raw);
  const auth = parsed.searchParams.get("auth") ?? parsed.username;
  const proxy: ClashProxy = {
    name: decodeURIComponentSafe(parsed.hash.slice(1)) || "hysteria",
    type: "hysteria",
    server: parsed.hostname,
    port: Number(parsed.port),
    auth_str: auth || undefined,
    obfs: parsed.searchParams.get("obfs") ?? undefined,
    protocol: parsed.searchParams.get("protocol") ?? undefined,
    up: parsed.searchParams.get("up") ?? undefined,
    down: parsed.searchParams.get("down") ?? undefined,
    sni: parsed.searchParams.get("peer") ?? parsed.searchParams.get("sni") ?? undefined,
    "skip-cert-verify": isTruthy(parsed.searchParams.get("insecure")),
  };

  return cleanupUndefined(proxy);
}

function parseHysteria2Uri(raw: string): ClashProxy {
  const parsed = new URL(raw);
  const proxy: ClashProxy = {
    name: decodeURIComponentSafe(parsed.hash.slice(1)) || "hysteria2",
    type: "hysteria2",
    server: parsed.hostname,
    port: Number(parsed.port),
    password: decodeURIComponentSafe(parsed.username),
    obfs: parsed.searchParams.get("obfs") ?? undefined,
    "obfs-password": parsed.searchParams.get("obfs-password") ?? undefined,
    sni: parsed.searchParams.get("sni") ?? parsed.searchParams.get("peer") ?? undefined,
    "skip-cert-verify": isTruthy(parsed.searchParams.get("insecure")),
  };

  return cleanupUndefined(proxy);
}

function parseTuicUri(raw: string): ClashProxy {
  const parsed = new URL(raw);
  const proxy: ClashProxy = {
    name: decodeURIComponentSafe(parsed.hash.slice(1)) || "tuic",
    type: "tuic",
    server: parsed.hostname,
    port: Number(parsed.port),
    uuid: decodeURIComponentSafe(parsed.username),
    password: decodeURIComponentSafe(parsed.password),
    udp: true,
    sni: parsed.searchParams.get("sni") ?? undefined,
    alpn: parsed.searchParams.getAll("alpn"),
    "disable-sni": isTruthy(parsed.searchParams.get("disable_sni")),
    "reduce-rtt": isTruthy(parsed.searchParams.get("reduce_rtt")),
    "request-timeout": parsed.searchParams.get("request_timeout")
      ? Number(parsed.searchParams.get("request_timeout"))
      : undefined,
    "congestion-controller": parsed.searchParams.get("congestion_control") ?? undefined,
  };

  return cleanupUndefined(proxy);
}

function parseWireguardUri(raw: string): ClashProxy {
  const parsed = new URL(raw);
  const proxy: ClashProxy = {
    name: decodeURIComponentSafe(parsed.hash.slice(1)) || "wireguard",
    type: "wireguard",
    server: parsed.hostname,
    port: Number(parsed.port),
    ip: parsed.searchParams.get("ip") ?? undefined,
    "private-key": decodeURIComponentSafe(parsed.username),
    "public-key": parsed.searchParams.get("publickey") ?? undefined,
    mtu: parsed.searchParams.get("mtu") ? Number(parsed.searchParams.get("mtu")) : undefined,
  };

  const reserved = parsed.searchParams.get("reserved");
  if (reserved) {
    proxy.reserved = reserved
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((part) => Number.isFinite(part));
  }

  return cleanupUndefined(proxy);
}

function applyCommonTransportOptions(proxy: ClashProxy, parsed: URL): void {
  const network = String(proxy.network ?? "tcp");
  if (network === "ws") {
    proxy["ws-opts"] = {
      path: parsed.searchParams.get("path") ?? "/",
      headers: parsed.searchParams.get("host")
        ? { Host: parsed.searchParams.get("host") }
        : undefined,
    };
  } else if (network === "grpc") {
    proxy["grpc-opts"] = {
      "grpc-service-name": parsed.searchParams.get("serviceName") ?? parsed.searchParams.get("path") ?? "",
    };
  } else if (network === "http") {
    proxy["http-opts"] = {
      path: [parsed.searchParams.get("path") ?? "/"],
      headers: parsed.searchParams.get("host")
        ? { Host: [parsed.searchParams.get("host")!] }
        : undefined,
    };
  }
}

function normalizeClashProxy(value: unknown, label: string): ClashProxy {
  assertPlainObject(value, label);
  const name = asString(value.name, `${label}.name`);
  const type = asString(value.type, `${label}.type`);
  return {
    ...value,
    name,
    type,
  };
}

function isCommentLine(line: string): boolean {
  return COMMENT_PREFIXES.some((prefix) => line.startsWith(prefix));
}

function isTailModifierToken(token: string): boolean {
  const lowered = token.toLowerCase();
  if (["no-resolve", "src", "dst", "tcp", "udp"].includes(lowered)) {
    return true;
  }

  return (
    /^\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?$/.test(token) ||
    /^[0-9a-f:]+(?:\/\d{1,3})?$/i.test(token)
  );
}

function decodeBase64Loose(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(paddingLength);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isTlsEnabled(parsed: URL): boolean {
  const security = parsed.searchParams.get("security");
  if (security) {
    return security.toLowerCase() === "tls" || security.toLowerCase() === "reality";
  }
  return isTruthy(parsed.searchParams.get("tls"));
}

function isTruthy(value: string | null): boolean {
  return value !== null && ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function cleanupUndefined<T extends JsonLike>(value: T): T {
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) {
      delete value[key];
    } else if (isPlainObject(entry)) {
      cleanupUndefined(entry);
      if (Object.keys(entry).length === 0) {
        delete value[key];
      }
    }
  }
  return value;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, `${label} must be an array`);
  }
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `${label} must be a non-empty string`);
  }
  return value;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError(400, `${label} must be a finite number`);
  }
  return value;
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new HttpError(400, `${label} must be a boolean`);
  }
  return value;
}

function assertPlainObject(value: unknown, label: string): asserts value is JsonLike {
  if (!isPlainObject(value)) {
    throw new HttpError(400, `${label} must be an object`);
  }
}

function isPlainObject(value: unknown): value is JsonLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
