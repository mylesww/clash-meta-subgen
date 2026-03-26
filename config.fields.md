# `config.example.yaml` 字段定义

这份文档描述新的 YAML 配置结构。它对应的是 `config.old.example.ini` 的等价表达，重点是把旧格式里混在一行的语义拆开，同时保持书写更短、更易读。

## 顶层结构

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `subs` | `Sub[]` | 是 | 订阅源列表。 |
| `exclude` | `string` | 否 | 对所有订阅源统一应用的节点名排除正则。 |
| `ruleSets` | `RuleSet[]` | 是 | 规则来源列表，每一项都表示“命中这些规则后走哪个策略组”。 |
| `proxyGroups` | `ProxyGroup[]` | 是 | 策略组列表，定义可选组、测速组和节点筛选规则。 |

顶层 `exclude` 会作用在所有导入的原始节点名上，仍然发生在重命名前；如果同时配置了顶层 `exclude` 和 `subs[].exclude`，任意一个命中都会排除该节点。

## `Sub`

订阅源定义。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `url` | `string` | 是 | 订阅链接，可以是 Clash、v2ray 等格式。 |
| `tag` | `string` | 是 | 订阅来源标签，用于区分不同来源。 |
| `exclude` | `string` | 否 | 当前订阅源自己的节点名排除正则。匹配到的上游节点会在导入后、重命名前被直接丢弃。 |

示例：

```yaml
url: https://example.com/sub?token=xxx
tag: main
exclude: "(试用|过期)"
```

## `RuleSet`

`ruleSets` 中的每一项都由策略名和规则来源组成。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `policy` | `string` | 是 | 规则命中后要使用的策略组名称。 |
| `source` | `RuleSource` | 是 | 规则来源定义。 |

示例：

```yaml
policy: 🎯 全球直连
source:
  type: remote
  url: https://example.com/direct.list
```

## `RuleSource`

### `remote`

远程规则文件。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | `"remote"` | 是 | 固定值。 |
| `url` | `string` | 是 | 远程规则文件地址。 |

示例：

```yaml
type: remote
url: https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/BanAD.list
```

### `geosite`

Geosite 规则源。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | `"geosite"` | 是 | 固定值。 |
| `value` | `string` | 是 | geosite 分类名。 |

示例：

```yaml
type: geosite
value: category-public-tracker
```

### `geoip`

GeoIP 规则源。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | `"geoip"` | 是 | 固定值。 |
| `value` | `string` | 是 | GeoIP 分类名，如 `LAN`、`CN`。 |
| `noResolve` | `boolean` | 是 | 是否附带 `no-resolve`。当前样例里固定为 `true`。 |

示例：

```yaml
type: geoip
value: CN
noResolve: true
```

### `final`

最终兜底规则。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | `"final"` | 是 | 固定值，表示旧配置中的 `[]FINAL`。 |

示例：

```yaml
type: final
```

## `ProxyGroup`

策略组统一使用同一套结构。`type` 只表示这个组怎么工作，`members` 只表示这个组从哪里拿成员，二者没有结构上的绑定关系。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | `string` | 是 | 策略组名称。 |
| `type` | `string` | 是 | 策略组工作方式。当前样例使用 `select` 和 `url-test`。 |
| `members` | `GroupMember[]` | 是 | 成员来源列表，可以混合组引用、内建动作和节点匹配。 |
| `test` | `UrlTestConfig` | 否 | 仅在需要测速参数的 `url-test` 组中出现。 |

`select` 示例：

```yaml
name: 🚀 节点选择
type: select
members:
  - type: group
    name: 🇭🇰 香港节点
  - type: group
    name: 🚀 手动切换
  - type: builtin
    name: DIRECT
```

`url-test` 示例：

```yaml
name: 🇭🇰 香港节点
type: url-test
test:
  url: http://www.gstatic.com/generate_204
  interval: 120
  tolerance: 20
members:
  - type: nodeMatch
    pattern: "(港|HK|Hong Kong)"
```

## `GroupMember`

策略组中的成员项，与 `ProxyGroup.type` 无关。

### `group`

引用另一个策略组。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | `"group"` | 是 | 固定值。 |
| `name` | `string` | 是 | 被引用的策略组名。 |

### `builtin`

引用内建动作。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | `"builtin"` | 是 | 固定值。 |
| `name` | `"DIRECT" \| "REJECT"` | 是 | 内建动作名。 |

### `nodeMatch`

通过正则表达式直接筛选节点。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | `"nodeMatch"` | 是 | 固定值。 |
| `pattern` | `string` | 是 | 用于匹配节点名称的正则表达式。 |
| `excludeTags` | `string[]` | 否 | 排除指定订阅 `tag` 的节点，发生在 `pattern` 命中之后。 |

示例：

```yaml
type: nodeMatch
pattern: ".*(家宽|无线|住宅)"
excludeTags:
  - backup-provider
```

## `UrlTestConfig`

`url-test` 组中的测速参数。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `url` | `string` | 是 | 用于测速的目标地址。 |
| `interval` | `number` | 是 | 测速间隔。 |
| `tolerance` | `number` | 是 | 延迟容差。 |

说明：

- 旧 `url-test` 语法中的三元参数形如 `120,2,20`。
- 新结构只保留已经能明确表达的 `interval=120` 和 `tolerance=20`。
- 中间的 `2` 在这次迁移中不进入 YAML 结构。

## 典型配置片段

### 远程规则 + 手选组

```yaml
policy: 💬 AI
source:
  type: remote
  url: https://assets.example.com/rules/ai.list
```

```yaml
name: 💬 AI
type: select
members:
  - type: group
    name: ✅ 家宽节点
  - type: group
    name: 🚀 节点选择
  - type: builtin
    name: DIRECT
```

### 纯节点筛选组

```yaml
name: 🚀 手动切换
type: select
members:
  - type: nodeMatch
    pattern: ".*"
```

### GeoIP / Final

```yaml
policy: 🎯 全球直连
source:
  type: geoip
  value: LAN
  noResolve: true
```

```yaml
policy: 🐟 漏网之鱼
source:
  type: final
```

## 旧 INI 到新 YAML 的映射

### `ruleset=策略名,https://...`

旧写法：

```ini
ruleset=💬 AI,https://assets.example.com/rules/ai.list
```

新写法：

```yaml
policy: 💬 AI
source:
  type: remote
  url: https://assets.example.com/rules/ai.list
```

### `ruleset=策略名,[]GEOSITE,xxx`

旧写法：

```ini
ruleset=🎯 全球直连,[]GEOSITE,category-public-tracker
```

新写法：

```yaml
policy: 🎯 全球直连
source:
  type: geosite
  value: category-public-tracker
```

### `ruleset=策略名,[]GEOIP,xxx,no-resolve`

旧写法：

```ini
ruleset=🎯 全球直连,[]GEOIP,CN,no-resolve
```

新写法：

```yaml
policy: 🎯 全球直连
source:
  type: geoip
  value: CN
  noResolve: true
```

### `ruleset=策略名,[]FINAL`

旧写法：

```ini
ruleset=🐟 漏网之鱼,[]FINAL
```

新写法：

```yaml
policy: 🐟 漏网之鱼
source:
  type: final
```

### `custom_proxy_group=组名\`select\`...`

旧写法：

```ini
custom_proxy_group=🛑 广告拦截`select`[]REJECT`[]DIRECT
```

新写法：

```yaml
name: 🛑 广告拦截
type: select
members:
  - type: builtin
    name: REJECT
  - type: builtin
    name: DIRECT
```

### `custom_proxy_group=组名\`select\`(正则)` 或 `custom_proxy_group=组名\`select\`.*`

旧写法：

```ini
custom_proxy_group=✅ 家宽节点`select`.*(家宽|无线|住宅)
```

新写法：

```yaml
name: ✅ 家宽节点
type: select
members:
  - type: nodeMatch
    pattern: ".*(家宽|无线|住宅)"
```

### `custom_proxy_group=组名\`url-test\`(正则)\`测速地址\`120,2,20`

旧写法：

```ini
custom_proxy_group=🇭🇰 香港节点`url-test`(港|HK|Hong Kong)`http://www.gstatic.com/generate_204`120,2,20
```

新写法：

```yaml
name: 🇭🇰 香港节点
type: url-test
test:
  url: http://www.gstatic.com/generate_204
  interval: 120
  tolerance: 20
members:
  - type: nodeMatch
    pattern: "(港|HK|Hong Kong)"
```
