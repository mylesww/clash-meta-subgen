import { stringify as stringifyYaml } from "yaml";

import { HttpError } from "./errors";
import {
  assertHttpsUrl,
  fetchText,
  fetchTextWithHeaders,
  parseConfigYaml,
  parseExtraYaml,
  parseSubscriptionPayload,
  rewriteRuleLineWithPolicy,
} from "./parse";
import type {
  ClashProxy,
  ConfigFile,
  GenerateOptions,
  GeneratedProxyGroup,
  GroupMember,
  JsonLike,
  ProxyGroupConfig,
} from "./types";

interface ResolvedProxyContext {
  proxies: ClashProxy[];
  proxyEntries: ResolvedProxyEntry[];
  proxyNameSet: Set<string>;
  forwardedHeaders: Headers;
}

interface ResolvedProxyEntry {
  name: string;
  sourceTag: string;
}

const FORWARDED_SUBSCRIPTION_HEADERS = [
  "subscription-userinfo",
  "profile-web-page-url",
  "profile-update-interval",
  "content-disposition",
] as const;

export async function generateClashYaml(options: GenerateOptions): Promise<string> {
  const { yaml } = await generateClashProfile(options);
  return yaml;
}

export async function generateClashProfile(
  options: GenerateOptions,
): Promise<{ yaml: string; forwardedHeaders: Headers }> {
  const fetchFn = options.fetchFn ?? fetch;
  const configUrl = assertHttpsUrl(options.configUrl, "config").toString();
  const extraUrl = assertHttpsUrl(options.extraUrl, "extra").toString();

  const [configText, extraText] = await Promise.all([
    fetchText(configUrl, "config YAML", fetchFn),
    fetchText(extraUrl, "extra YAML", fetchFn),
  ]);

  const configFromFile = parseConfigYaml(configText, "config");
  const config: ConfigFile = {
    ...configFromFile,
    subs: [...configFromFile.subs, ...(options.extraSubs ?? [])],
  };
  const extra = parseExtraYaml(extraText, "extra");
  const resolvedProxies = await loadAllProxies(config, fetchFn, options.subscriptionFetchHeaders);
  const proxyGroups = buildProxyGroups(config, resolvedProxies);
  const rules = await buildRules(config, fetchFn);

  const output: JsonLike = {
    ...extra,
    proxies: resolvedProxies.proxies,
    "proxy-groups": proxyGroups,
    rules,
  };

  return {
    yaml: stringifyYaml(output, {
      lineWidth: 0,
      indent: 2,
      simpleKeys: true,
    }),
    forwardedHeaders: resolvedProxies.forwardedHeaders,
  };
}

async function loadAllProxies(
  config: ConfigFile,
  fetchFn: typeof fetch,
  subscriptionFetchHeaders?: HeadersInit,
): Promise<ResolvedProxyContext> {
  const usedNames = new Set<string>();
  const proxies: ClashProxy[] = [];
  const proxyEntries: ResolvedProxyEntry[] = [];
  const globalExcludeMatcher = buildExcludeMatcher(config.exclude, "exclude");
  const forwardedHeaders = new Headers();

  for (const [index, source] of config.subs.entries()) {
    assertHttpsUrl(source.url, `subs[${source.tag}]`);
    const { text, headers } = await fetchTextWithHeaders(
      source.url,
      `subscription "${source.tag}"`,
      fetchFn,
      subscriptionFetchHeaders,
    );
    if (!hasForwardedSubscriptionHeaders(forwardedHeaders) && hasForwardedSubscriptionHeaders(headers)) {
      copyForwardedHeaders(headers, forwardedHeaders);
    }
    const parsed = parseSubscriptionPayload(text, source.tag);
    const excludeMatcher = buildExcludeMatcher(source.exclude, `subs[${source.tag}].exclude`);
    const filtered = parsed.filter(
      (proxy) =>
        !(globalExcludeMatcher && globalExcludeMatcher.test(proxy.name)) &&
        !(excludeMatcher && excludeMatcher.test(proxy.name)),
    );
    for (const proxy of filtered) {
      const renamed = renameProxy(proxy, source.tag, usedNames);
      usedNames.add(renamed.name);
      proxies.push(renamed);
      proxyEntries.push({
        name: renamed.name,
        sourceTag: source.tag,
      });
    }
  }

  return {
    proxies,
    proxyEntries,
    proxyNameSet: new Set(proxies.map((proxy) => proxy.name)),
    forwardedHeaders,
  };
}

function copyForwardedHeaders(source: Headers, target: Headers): void {
  for (const headerName of FORWARDED_SUBSCRIPTION_HEADERS) {
    const value = source.get(headerName);
    if (value) {
      target.set(headerName, value);
    }
  }
}

function hasForwardedSubscriptionHeaders(headers: Headers): boolean {
  return FORWARDED_SUBSCRIPTION_HEADERS.some((headerName) => Boolean(headers.get(headerName)));
}

function renameProxy(proxy: ClashProxy, tag: string, usedNames: Set<string>): ClashProxy {
  const originalName = String(proxy.name);
  if (!usedNames.has(originalName)) {
    return {
      ...proxy,
      name: originalName,
    };
  }

  const baseName = `${tag}-${originalName}`;
  let nextName = baseName;
  let index = 2;
  while (usedNames.has(nextName)) {
    nextName = `${baseName}-${index}`;
    index += 1;
  }
  return {
    ...proxy,
    name: nextName,
  };
}

function buildExcludeMatcher(pattern: string | undefined, label: string): RegExp | null {
  if (!pattern) {
    return null;
  }

  try {
    return new RegExp(pattern);
  } catch {
    throw new HttpError(400, `${label} is not a valid regex: ${pattern}`);
  }
}

function buildProxyGroups(config: ConfigFile, context: ResolvedProxyContext): GeneratedProxyGroup[] {
  const declaredGroupNames = new Set(config.proxyGroups.map((group) => group.name));

  return config.proxyGroups.map((group) => {
    validateGroupConfig(group);
    const proxies = resolveMembers(group, context, declaredGroupNames);

    if (group.type === "url-test") {
      if (!group.test) {
        throw new HttpError(400, `proxyGroups.${group.name} requires test settings for url-test`);
      }
      const invalid = proxies.filter((entry) => !context.proxyNameSet.has(entry));
      if (invalid.length > 0) {
        throw new HttpError(
          400,
          `proxyGroups.${group.name} contains non-node members for url-test: ${invalid.join(", ")}`,
        );
      }

      return {
        name: group.name,
        type: group.type,
        url: group.test.url,
        interval: group.test.interval,
        tolerance: group.test.tolerance,
        proxies,
      };
    }

    return {
      name: group.name,
      type: group.type,
      proxies,
    };
  });
}

function validateGroupConfig(group: ProxyGroupConfig): void {
  if (group.type !== "select" && group.type !== "url-test") {
    throw new HttpError(400, `proxyGroups.${group.name} type is not supported: ${group.type}`);
  }

  if (group.members.length === 0) {
    throw new HttpError(400, `proxyGroups.${group.name} must contain at least one member`);
  }
}

function resolveMembers(
  group: ProxyGroupConfig,
  context: ResolvedProxyContext,
  declaredGroupNames: Set<string>,
): string[] {
  const output: string[] = [];
  const seen = new Set<string>();

  const pushUnique = (value: string): void => {
    if (!seen.has(value)) {
      seen.add(value);
      output.push(value);
    }
  };

  for (const member of group.members) {
    switch (member.type) {
      case "group":
        if (!declaredGroupNames.has(member.name)) {
          throw new HttpError(400, `proxyGroups.${group.name} references unknown group: ${member.name}`);
        }
        pushUnique(member.name);
        break;
      case "builtin":
        pushUnique(member.name);
        break;
      case "nodeMatch": {
        let matcher: RegExp;
        try {
          matcher = new RegExp(member.pattern);
        } catch {
          throw new HttpError(400, `proxyGroups.${group.name} has invalid regex: ${member.pattern}`);
        }
        const includedTags = member.includeTags ? new Set(member.includeTags) : null;
        const excludedTags = new Set(member.excludeTags ?? []);
        const matches = context.proxyEntries.filter(
          (entry) =>
            (!includedTags || includedTags.has(entry.sourceTag)) &&
            !excludedTags.has(entry.sourceTag) &&
            matcher.test(entry.name),
        );
        for (const match of matches) {
          pushUnique(match.name);
        }
        break;
      }
      default:
        assertNever(member);
    }
  }

  return output;
}

async function buildRules(config: ConfigFile, fetchFn: typeof fetch): Promise<string[]> {
  const rules: string[] = [];

  for (const ruleSet of config.ruleSets) {
    switch (ruleSet.source.type) {
      case "remote": {
        assertHttpsUrl(ruleSet.source.url, `ruleSets.${ruleSet.policy}.source.url`);
        const text = await fetchText(ruleSet.source.url, `rule set "${ruleSet.policy}"`, fetchFn);
        const lines = text
          .split(/\r?\n/)
          .map((line) => stripInlineHashComment(line).trim())
          .filter((line) => line.length > 0 && !isCommentLine(line));
        for (const line of lines) {
          rules.push(rewriteRuleLineWithPolicy(line, ruleSet.policy));
        }
        break;
      }
      case "geosite":
        rules.push(`GEOSITE,${ruleSet.source.value},${ruleSet.policy}`);
        break;
      case "geoip":
        rules.push(
          ruleSet.source.noResolve
            ? `GEOIP,${ruleSet.source.value},${ruleSet.policy},no-resolve`
            : `GEOIP,${ruleSet.source.value},${ruleSet.policy}`,
        );
        break;
      case "final":
        rules.push(`MATCH,${ruleSet.policy}`);
        break;
      default:
        assertNever(ruleSet.source);
    }
  }

  return rules;
}

function isCommentLine(line: string): boolean {
  return line.startsWith("#") || line.startsWith(";") || line.startsWith("//");
}

function stripInlineHashComment(line: string): string {
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (quote) {
      if (char === quote && line[index - 1] !== "\\") {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "#") {
      const previous = index > 0 ? line[index - 1] : "";
      if (index === 0 || /\s/.test(previous)) {
        return line.slice(0, index).trimEnd();
      }
    }
  }

  return line;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
