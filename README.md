# clash-meta-subgen

`clash-meta-subgen` 是一个运行在 Cloudflare Workers 上的 Clash Meta / mihomo 订阅生成服务。

服务在请求时拉取远程配置、顶层 Clash Meta 配置、上游节点订阅与远程规则列表，生成完整的 Clash Meta YAML，包括 `proxies`、`proxy-groups` 与 `rules`。

## 项目说明

适用场景：

- 已有多个节点订阅，需要统一聚合
- 已有一套策略组和规则，需要动态生成最终订阅
- 希望将 Clash Meta 配置与节点源解耦，按请求实时生成 YAML

核心输入：

- `config.yaml`
  定义上游订阅、排除规则、规则源与策略组。
- `extra.yaml`
  定义 Clash Meta 顶层字段，例如 `port`、`dns`、`tun`、`sniffer`。

参考文件：

- 配置示例：[config.example.yaml](./config.example.yaml)
- 字段说明：[config.fields.md](./config.fields.md)
- 顶层配置示例：[extra.yaml](./extra.yaml)

## 快速开始

1. 准备两个可通过 `https://` 访问的远程 YAML

- 一个 `config.yaml`
- 一个 `extra.yaml`

2. 复制部署模板

```bash
cp wrangler.example.toml wrangler.toml
```

3. 设置 Worker 密钥

```bash
npx wrangler secret put ACCESS_TOKEN
npx wrangler secret put RESULT_CACHE_TTL_SECONDS
```

4. 部署服务

```bash
npm run deploy
```

5. 通过网页生成链接

访问部署后的网页

- 首页 `/`
  用于生成基础订阅链接，填写 `config.yaml` 链接、`extra.yaml` 链接和 `token` 即可。
- `/append-subs.html`
  用于在已有生成链接上追加临时 `subs`。

6. 直接调用生成接口

```text
GET /sub?config=<config-url>&extra=<extra-url>&token=<token>
```

示例：

```text
https://your-domain.example/sub?config=https://example.com/config.yaml&extra=https://example.com/extra.yaml&token=YOUR_TOKEN
```

如需临时追加上游订阅：

```text
https://your-domain.example/sub?config=https://example.com/config.yaml&extra=https://example.com/extra.yaml&token=YOUR_TOKEN&subs=https://example.com/sub-a&subs=https://example.com/sub-b
```

## 相关文档

- 配置字段说明：[config.fields.md](./config.fields.md)
- 开发说明：[docs/development.md](./docs/development.md)
