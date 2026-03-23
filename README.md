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

推荐方式：使用 Cloudflare 一键部署。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mylesww/clash-meta-subgen)

1. 点击上面的 `Deploy to Cloudflare`

2. 在 Cloudflare 部署页完成项目导入，并填写需要的密钥

- `ACCESS_TOKEN`
- `RESULT_CACHE_TTL_SECONDS`

3. 部署完成后，默认会得到一个 `workers.dev` 地址

4. 准备两个可通过 `https://` 访问的远程 YAML

- 一个 `config.yaml`
- 一个 `extra.yaml`

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

如需绑定自定义域名，建议在部署完成后再到 Cloudflare Dashboard 为该 Worker 添加 Custom Domain。

## 相关文档

- 配置字段说明：[config.fields.md](./config.fields.md)
- 开发说明：[docs/development.md](./docs/development.md)
