# 部署说明（自建实例）

本 fork 由 yanzaiyun43 自用于 `https://mail.ailmel.top`。

## 拓扑

| 层 | 位置 |
|---|---|
| 面板 | Vercel 项目 `agentbox`（团队 ailmels-projects） |
| 数据 | Cloudflare D1 `agentbox` |
| 收信 | Cloudflare Worker `agentbox-email` + Email Routing（每个收件箱一条 per-address 规则） |
| 附件 | 未启用（账户无信用卡，R2 不可用） |

## 环境变量（Vercel）

| 变量 | 用途 |
|---|---|
| `CF_API_TOKEN` | 建 D1/Worker/Routing 规则，并在运行时读写 D1 |
| `AGENTBOX_SECRET` | 签 session JWT，`openssl rand -hex 32` |

## 首次初始化顺序

1. `POST /api/auth/setup` 建管理员。
2. `POST /api/settings/domains` 加域名（第一个即 primary）。
3. `POST /api/provision` 自动建 D1 + 部署 worker。
4. 开启该域名的 Email Routing（`POST /zones/{zone}/email/routing/enable` 用全权限令牌可直接开，无需手动点面板）。
5. `POST /api/keys` 建 API key，供 `/v1` 与 `/mcp` 使用。

## 域名

`mail.ailmel.top` 必须 CNAME 到 Vercel 且 **proxied=false**；走 Cloudflare 橙云代理会导致 Vercel 域名校验不通过。
