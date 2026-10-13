# Development Notes

本文档面向项目维护者，描述 `clash-meta-subgen` 的实现结构、处理流程和运行行为。

## 项目结构

- [src/index.ts](../src/index.ts)：Worker 入口、鉴权、缓存、HTTP 路由
- [src/lib/generate.ts](../src/lib/generate.ts)：主生成流程
- [src/lib/parse.ts](../src/lib/parse.ts)：YAML、订阅、规则解析
- [src/lib/types.ts](../src/lib/types.ts)：核心类型定义
- [web/src/App.tsx](../web/src/App.tsx)：React 单页应用、布局与前端路由
- [web/src/lib/links.ts](../web/src/lib/links.ts)：订阅链接生成、解析、校验与查询参数预填
- [web/vite.config.ts](../web/vite.config.ts)：前端构建与开发代理
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

## 前端开发

前端使用 React、TypeScript、Vite 和 React Router，源码与静态资源位于 `web/`，产物位于 `web/dist/`（不提交）。依赖统一由根目录的 `package.json` 和 `package-lock.json` 管理。前端 DOM、构建工具 Node 和后端 Worker 使用各自的 TypeScript 配置。

使用 Node.js 24.15 或更高版本安装依赖：

```bash
npm ci
```

在项目根目录的 `.dev.vars` 中设置本地 `ACCESS_TOKEN`，例如 `ACCESS_TOKEN="your-local-token"`。运行完整 Worker 和构建后的前端：

```bash
npm run dev
```

访问 `http://localhost:8787`。Wrangler 会先构建前端，并监听前端源码变化重新构建。

需要 React 热更新时，保持上述命令运行，在另一个终端执行：

```bash
npm run dev:web
```

访问 Vite 输出的地址（默认 `http://localhost:5173`）。生成链接使用当前页面的域名；Vite 将 `/sub` 请求代理至 `http://127.0.0.1:8787`。如果更改 Worker 端口，需要同步修改 Vite 代理。

生产构建与部署：

```bash
npm run build
npm run deploy
```

`npm run build` 只构建前端。Wrangler 的自定义构建也会在 `dev`、`deploy` 时自动执行它，因此可直接运行 `npm run deploy`，Cloudflare 一键部署同样会包含前端产物。仅验证打包、不发布可运行 `npx wrangler deploy --dry-run`。

## 网页功能

### 首页 `/`

功能：

- 在同一表单中输入 `config`、`extra`、可选的 `token` 和额外订阅
- `token` 留空或仅含空白时，生成前弹出警告确认；取消则不生成，确认后省略链接中的 `token` 参数。访问订阅时仍需满足服务端鉴权要求
- 每行输入一个额外订阅 URL，忽略空行与首尾空白，保留顺序与重复项
- 用一个“生成订阅链接”按钮生成当前网站的 `/sub` 链接，额外订阅作为重复的 `subs` 参数加入；留空时省略 `subs`
- 粘贴已有链接后点击“解析并回填”，恢复全部字段；原链接没有 `subs` 时清空额外订阅输入框
- 解析成功后清除校验错误和旧结果，并将原链接写入当前页面地址的 `baseLink` 参数；刷新或分享该地址可恢复导入的配置。解析失败时显示错误并保留当前地址、配置与结果
- 从查询参数 `baseLink` 解析已有链接并回填；无效链接显示解析错误，仍可手动填写配置
- 从查询参数 `config`、`extra`、`token` 预填表单
- 支持复制与直接打开

旧链接解析使用 `URL` 和 `URLSearchParams`，仅在本地提取参数，不访问链接。导入时要求 HTTP(S) URL 且存在 `config`、`extra` 参数，缺少 `token` 时回填为空，字段值在生成时校验。非空白令牌按原值保留，嵌套 URL 不重复解码。重新生成使用当前表单的参数，不继承旧链接的域名、路径、其他参数或片段。

配置文件与额外订阅链接必须使用 HTTPS；原生成链接允许 HTTP 或 HTTPS。额外订阅校验失败时显示原始行号。复制失败时自动选中结果以便手动复制。修改配置后会清除旧结果，避免复制与当前输入不一致的链接。

界面采用中文响应式布局。导航通过浏览器 History 路由完成，支持直接访问、刷新与前进后退。解析回填时替换当前历史记录，手动编辑字段不自动更新地址。未知地址显示应用内 404，不提供 `.html` 页面兼容路由。SPA 的 404 是客户端界面，页面导航本身由静态资源服务返回入口 HTML（HTTP 200）。

## Cloudflare 配置

仓库中同时保留了 [wrangler.toml](../wrangler.toml) 与 [wrangler.example.toml](../wrangler.example.toml) 两份模板配置，用于一键部署和手动部署说明。

当前模板配置要点：

- Worker 名称：`clash-meta-subgen`
- 静态资源目录：`web/dist`
- `single-page-application` 回退，支持前端路由直接访问和刷新
- `/sub` 优先进入 Worker，包括浏览器直接打开，避免被 SPA 回退接管
- `[build]` 自动执行前端构建，仅监听前端源码、入口和构建配置，避免输出目录触发循环
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
- 前端查询参数预填、旧链接解析回填、URL 编码、统一生成与额外订阅清除及输入校验
- 解析失败时保留表单与结果、键盘提交、复制成功／失败、兼容入口与浏览器前进后退
- 未知路径及 `.html` 地址的应用内 404

Vitest 将后端测试运行在 Node 环境，将 `web/src` 下的测试运行在 jsdom 环境；前端交互使用 React Testing Library 验证。`npm run check` 检查后端、前端与构建配置的类型。

## 相关文档

- 首页说明：[README.md](../README.md)
- 配置字段定义：[config.fields.md](../config.fields.md)
