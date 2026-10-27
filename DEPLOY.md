# 部署说明

本文记录一套**自建实例**的落地顺序，供部署参考。所有实例相关的标识（域名、账号、团队名）均已用占位符替换。

## 拓扑

| 层 | 位置 |
|---|---|
| 面板 | Vercel 项目 `agentbox` |
| 数据 | Cloudflare D1 `agentbox` |
| 收信 | Cloudflare Worker `agentbox-email` + Email Routing（每个收件箱一条 per-address 规则，或整域 catch-all） |
| 附件 | 可选，需 R2（账户绑卡） |

## 环境变量（Vercel）

| 变量 | 用途 |
|---|---|
| `CF_API_TOKEN` | 建 D1 / Worker / Routing 规则，并在运行时读写 D1 |
| `AGENTBOX_SECRET` | 签 session JWT，`openssl rand -hex 32` |

## 首次初始化顺序

1. `POST /api/auth/setup` 建管理员
2. `POST /api/settings/domains` 加域名（第一个即 primary）
3. `POST /api/provision` 自动建 D1 + 部署 worker
4. 开启该域名的 Email Routing
   - `POST /zones/{zone}/email/routing/enable` 用带 `Zone Settings Write` 的令牌可直接开
   - 只有 `Email Routing Rules` 权限时，需在 Cloudflare 面板手动点一次
5. `POST /api/keys` 建 API key，供 `/v1` 与 `/mcp` 使用

## 自定义域名

面板域名（如 `mail.example.com`）必须 CNAME 到 Vercel 且 **proxied = false**。
走 Cloudflare 橙云代理会导致 Vercel 的域名校验不通过。

## 收信域名

每个收信域名需要：

1. 加入 AgentBox 的域名列表
2. 在 Cloudflare 开启 Email Routing（会自动写入 MX 与 SPF）
3. 决定收信方式：
   - **per-address 规则** —— 每个收件箱登记一条，单域约 200 条上限
   - **catch-all 规则** —— 整域投给 worker，不限箱数，但未建箱的地址需要自动建箱机制配合

## 已知边界

- `Email Routing Rules` 权限**不能**切换总开关，需要 `Zone Settings Write`
- `POST /v1/inboxes` 固定用 primary 域名；要用别的域名需先切 primary 或走 MCP 的 `create_inbox_on_domain`
- 修改 `worker-template.ts` 后必须 `POST /api/provision` 重新部署，Vercel 部署只更新面板
- 删除 destination address 有约 10 分钟的冷却期（错误码 `2032`）
