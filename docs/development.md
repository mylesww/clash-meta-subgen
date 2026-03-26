# Development Notes

本文档面向项目维护者，描述 `clash-meta-subgen` 的实现结构、处理流程和运行行为。

## 项目结构

- [src/index.ts](../src/index.ts)：Worker 入口、鉴权、缓存、HTTP 路由
- [src/lib/generate.ts](../src/lib/generate.ts)：主生成流程
- [src/lib/parse.ts](../src/lib/parse.ts)：YAML、订阅、规则解析
- [src/lib/types.ts](../src/lib/types.ts)：核心类型定义
- [public/index.html](../public/index.html)：主静态页面
- [public/append-subs.html](../public/append-subs.html)：额外订阅拼接页面
- [tests/parse.test.ts](../tests/parse.test.ts)：解析层测试
- [tests/generate.test.ts](../tests/generate.test.ts)：生成流程测试

## 请求处理流程

`GET /sub` 的处理顺序如下：

1. 校验 `token`
2. 校验 `config` 与 `extra` 查询参数
3. 读取请求中额外传入的 `subs`
4. 根据完整请求 URL 查询 Cloudflare Cache
5. 拉取并解析远程 `config.yaml`
6. 拉取并解析远程 `extra.yaml`
7. 合并 `config.subs` 与请求里的额外 `subs`
8. 拉取所有订阅源并解析节点
9. 应用顶层 `exclude` 与 `subs[].exclude`
10. 处理节点重名
11. 构建 `proxy-groups`
12. 拉取并展开 `ruleSets`
13. 输出最终 YAML
14. 成功结果写入缓存

## 订阅解析

当前支持两类订阅输入：

- Clash YAML 订阅
- Base64 / URI 混合订阅

支持的协议：

- `ss`
- `ssr`
- `vmess`
- `vless`
- `trojan`
- `hysteria`
- `hysteria2`
- `hy2`
- `tuic`
- `wireguard`

解析入口位于 [src/lib/parse.ts](../src/lib/parse.ts) 的 `parseSubscriptionPayload()`。

## 节点过滤与重名策略

### 过滤顺序

节点过滤发生在重命名前，且基于原始节点名。

支持两层过滤：

- 顶层 `exclude`
- 单订阅源 `subs[].exclude`

任意一层命中都会排除节点。

### 重名策略

如果节点名称冲突：

1. 优先保留原始名称
2. 冲突时改为 `tag-原名`
3. 若仍冲突，再追加 `-2`、`-3`

实现位于 [src/lib/generate.ts](../src/lib/generate.ts) 的 `renameProxy()`。

## 规则处理

`ruleSets` 当前支持四种来源：

- `remote`
- `geosite`
- `geoip`
- `final`

处理结果：

- `remote`：远程规则逐行展开后注入 `policy`
- `geosite`：输出 `GEOSITE,<value>,<policy>`
- `geoip`：输出 `GEOIP,<value>,<policy>` 或 `...,no-resolve`
- `final`：输出 `MATCH,<policy>`

### 远程规则注释处理

- 整行 `#` / `;` / `//` 注释会忽略
- 行尾 `# comment` 会剥离
- 合法规则 payload 内的 `#` 尽量保留

### 规则注入行为

规则行会使用“顶层逗号分割”方式重写，尽量兼容逻辑规则与尾部 modifier。

相关实现：

- [src/lib/parse.ts](../src/lib/parse.ts) 的 `splitTopLevelCsv()`
- [src/lib/parse.ts](../src/lib/parse.ts) 的 `rewriteRuleLineWithPolicy()`

## 策略组处理

当前支持的 `proxyGroups.type`：

- `select`
- `url-test`

当前支持的 `members.type`：

- `group`
- `builtin`
- `nodeMatch`

行为说明：

- `group`：引用已声明策略组
- `builtin`：内建动作，如 `DIRECT`、`REJECT`
- `nodeMatch`：可先按订阅 `tag` 缩小范围，再用正则匹配最终节点名

注意：

- `url-test` 组必须最终只包含具体节点名
- 如果展开后仍包含组名或内建动作，会返回 `400`
- `nodeMatch.includeTags` 先做正向来源过滤，`excludeTags` 再做排除，最后才应用正则匹配

## 缓存与鉴权

### 鉴权

接口使用简单 token 鉴权：

- 查询参数：`token`
- 环境变量：`ACCESS_TOKEN`

### 缓存

- 只有成功结果会进入缓存
- 失败结果不会缓存
- 缓存键为完整请求 URL
- TTL 由 `RESULT_CACHE_TTL_SECONDS` 控制

## 静态页面

### 首页 `/`

功能：

- 输入 `config`
- 输入 `extra`
- 输入 `token`
- 生成基础 `/sub` 链接
- 支持复制与直接打开

### `/append-subs.html`

功能：

- 输入已有生成链接
- 追加额外订阅 URL
- 重新生成带 `subs` 参数的新链接
- 支持复制与直接打开

## Cloudflare 配置

仓库中同时保留了 [wrangler.toml](../wrangler.toml) 与 [wrangler.example.toml](../wrangler.example.toml) 两份模板配置，用于一键部署和手动部署说明。

当前模板配置要点：

- Worker 名称：`clash-meta-subgen`
- 静态资源目录：`public`
- `404-page` 静态兜底
- `/sub` 优先进入 Worker
- 默认不绑定自定义域名

## 测试

测试命令：

```bash
npm test
```

类型检查：

```bash
npm run check
```

当前测试覆盖重点：

- 订阅解析
- 规则改写
- `url-test` 成员校验
- 重名处理
- 全局与单源 `exclude`
- 额外 `subs` 合并

## 相关文档

- 首页说明：[README.md](../README.md)
- 配置字段定义：[config.fields.md](../config.fields.md)
