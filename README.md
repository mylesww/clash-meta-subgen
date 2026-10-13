# clash-meta-subgen

`clash-meta-subgen` 是一个运行在 Cloudflare Workers 上的 Clash Meta / mihomo 订阅生成服务。

它的用途是把多个节点订阅链接, 以及自己自定义的策略组配置和规则配置，在请求时动态拼装成一份可直接使用的 Clash Meta YAML。

服务会在收到请求后，拉取远程配置、顶层 Clash Meta 配置、上游节点订阅与远程规则列表，最终生成完整的 Clash Meta YAML，包括 `proxies`、`proxy-groups` 与 `rules`。

## 项目说明

这个项目适合下面几类场景：

- 已有多个节点订阅，需要统一聚合
- 已有一套策略组和规则，需要动态生成最终订阅
- 希望将 Clash Meta 配置与节点源解耦，按请求实时生成 YAML


核心配置文件：

- `config.yaml`
  用来定义上游订阅、排除规则、规则源与策略组, 对应clash meta配置文件的`proxies`、`proxy-groups`、`rules` 字段
- `extra.yaml`
  用来定义 Clash Meta 的其他任意顶层字段，例如 `port`、`dns`、`tun`、`sniffer`。

### 配置参考文件：

- 配置示例：[config.example.yaml](./config.example.yaml)
- 字段说明：[config.fields.md](./config.fields.md)
- 顶层配置示例：[extra.yaml](./extra.yaml)

## 快速开始

推荐方式是直接部署到 Cloudflare Workers。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mylesww/clash-meta-subgen)

### 1. 部署服务

新标签打开上面的 `Deploy to Cloudflare`，在 Cloudflare 部署页完成项目导入，并填写需要的环境变量：

- `ACCESS_TOKEN`: 自己设置一个复杂的token, 在生成时需要token正确才能使用, 防止其他人恶意调用
- `RESULT_CACHE_TTL_SECONDS`: 订阅缓存的时间

部署完成后，Cloudflare 会分配一个默认的 `workers.dev` 地址。

### 2. 准备配置文件

准备你自己的 `config.yaml` 和 `extra.yaml`，并确保它们可以通过 URL 直接下载。

可以直接参考上面的[配置参考文件](#配置参考文件)：

- [config.example.yaml](./config.example.yaml)
- [extra.yaml](./extra.yaml)

### 3. 生成订阅链接

有两种使用方式。

#### 方式一：通过网页生成

访问部署后的首页 `/`，在同一表单中填写 `config.yaml` 链接、`extra.yaml` 链接和可选的 `token`。`token` 留空时会提示确认，确认后生成不含 `token` 的链接；访问订阅时仍需满足服务端鉴权要求。如需加入额外订阅，在“额外订阅链接”中每行填写一个 HTTPS 链接，然后点击“生成订阅链接”一起生成；留空则不添加额外订阅。

已有生成链接时，可以粘贴到“已有订阅链接”，点击“解析并回填”恢复配置地址、令牌和额外订阅列表，修改后再次生成。解析成功后会将原链接写入当前页面地址的 `baseLink` 参数，刷新或分享该地址可恢复导入的配置。解析在浏览器本地完成，失败时保留当前地址和配置。新链接使用当前网站的 `/sub` 地址，参数来自当前表单。

网页使用 React 单页应用，支持直接访问和刷新。首页支持通过 `baseLink` 预填。旧 `.html` 页面地址不再提供。

#### 方式二：直接调用接口

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

### 4. 可选：绑定自定义域名(推荐)

默认分配的`workers.dev`在一些网络环境下会有访问问题, 建议到cloudflare面板为为该 Worker 添加自定义域名来访问。


## 相关文档

- 配置字段说明：[config.fields.md](./config.fields.md)
- 开发说明：[docs/development.md](./docs/development.md)
