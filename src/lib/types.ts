export interface Env {
  ACCESS_TOKEN: string;
  RESULT_CACHE_TTL_SECONDS?: string;
}

export type JsonLike = Record<string, unknown>;

export interface SubConfig {
  url: string;
  tag: string;
  exclude?: string;
}

export interface RemoteRuleSource {
  type: "remote";
  url: string;
}

export interface GeositeRuleSource {
  type: "geosite";
  value: string;
}

export interface GeoipRuleSource {
  type: "geoip";
  value: string;
  noResolve?: boolean;
}

export interface FinalRuleSource {
  type: "final";
}

export type RuleSource =
  | RemoteRuleSource
  | GeositeRuleSource
  | GeoipRuleSource
  | FinalRuleSource;

export interface RuleSetConfig {
  policy: string;
  source: RuleSource;
}

export interface GroupRefMember {
  type: "group";
  name: string;
}

export interface BuiltinMember {
  type: "builtin";
  name: string;
}

export interface NodeMatchMember {
  type: "nodeMatch";
  pattern: string;
  includeTags?: string[];
  excludeTags?: string[];
}

export type GroupMember = GroupRefMember | BuiltinMember | NodeMatchMember;

export interface UrlTestConfig {
  url: string;
  interval: number;
  tolerance: number;
}

export interface ProxyGroupConfig {
  name: string;
  type: string;
  members: GroupMember[];
  test?: UrlTestConfig;
}

export interface ConfigFile {
  subs: SubConfig[];
  exclude?: string;
  ruleSets: RuleSetConfig[];
  proxyGroups: ProxyGroupConfig[];
}

export interface ClashProxy extends JsonLike {
  name: string;
  type: string;
}

export interface GeneratedProxyGroup extends JsonLike {
  name: string;
  type: string;
  proxies: string[];
}

export interface GenerateOptions {
  configUrl: string;
  extraUrl: string;
  extraSubs?: SubConfig[];
  fetchFn?: typeof fetch;
  subscriptionFetchHeaders?: HeadersInit;
}
