# AgentBox

**给 AI 智能体用的收件箱。** 按需创建邮箱地址，接收验证码与注册确认信，通过 REST API 或 MCP 读取。

基于 Cloudflare 自建，开源、免费、无需信用卡。

<p>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js_16-000000?logo=nextdotjs&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React_19-20232A?logo=react&logoColor=61DAFB" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_v4-06B6D4?logo=tailwindcss&logoColor=white" />
  <img alt="Cloudflare" src="https://img.shields.io/badge/Cloudflare-F38020?logo=cloudflare&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-22C55E" />
</p>

---

> **关于本仓库**
>
> 这是 [mastomii/agentbox](https://github.com/mastomii/agentbox) 的 fork，遵循上游 **MIT** 协议。
> 在上游基础上做了若干本地增强（界面汉化、MCP 工具扩充、自动建箱、自动清理、字符集修复），
> 明细见 [与上游的差异](#与上游的差异)。

---

## 目录

- [它解决什么问题](#它解决什么问题)
- [工作原理](#工作原理)
- [与上游的差异](#与上游的差异)
- [部署到 Vercel](#部署到-vercel)
- [环境要求](#环境要求)
- [Cloudflare API 令牌](#cloudflare-api-令牌)
- [首次初始化](#首次初始化)
- [多域名](#多域名)
- [自动建箱](#自动建箱)
- [自动清理](#自动清理)
- [Docker](#docker)
- [智能体 API（`/v1`）](#智能体-apiv1)
- [MCP 服务](#mcp-服务)
- [面板](#面板)
- [清理与重置](#清理与重置)
- [注意事项与限制](#注意事项与限制)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [许可证](#许可证)

---

## 它解决什么问题

AI 智能体要注册服务、要收验证码，就需要一个邮箱。人工开邮箱太慢，共享一个邮箱又不安全。

AgentBox 让智能体自己开：

```bash
# 1. 开一个收件箱
curl -X POST https://your-host/v1/inboxes \
  -H "Authorization: Bearer ab_..." \
  -d '{"label":"github-signup"}'
# → { "id": "inbox_abc123", "address": "swift-fox-ab12@yourdomain.com" }

# 2. 拿这个地址去注册，然后长轮询等信
curl "https://your-host/v1/inboxes/inbox_abc123/messages?wait=30" \
  -H "Authorization: Bearer ab_..."
# → 收到验证邮件

# 3. 读完就释放
curl -X DELETE https://your-host/v1/inboxes/inbox_abc123 \
  -H "Authorization: Bearer ab_..."
```

也可以用内置的 **MCP 服务**，MCP 原生客户端（Claude Code、Cursor 等）直接调用。

## 工作原理

```
来信
   │
   ▼
Cloudflare Email Routing      把地址投递给 worker
   │
   ▼
邮件 Worker  agentbox-email   解析 MIME → 写入 D1
   │
   ├──▶ Cloudflare D1        消息行 + 附件元数据
   │
   └──▶ Cloudflare R2        附件二进制（可选，需绑卡）
   │
   ▼
AgentBox 面板 / 智能体 API    通过 Cloudflare REST API 读
```

| 组件 | 职责 |
|---|---|
| **面板**（Next.js 应用） | 登录、设置、收件箱界面、API 密钥管理 |
| **控制面** | 用 `CF_API_TOKEN` 调 Cloudflare API 建 D1、部署 worker、登记路由规则。**不需要 wrangler** |
| **存储** | 用户、设置、密钥、收件箱、邮件全部存在一个 D1 库里，所以应用本身无状态，可以直接跑在 Vercel |

## 与上游的差异

| 改动 | 说明 |
|---|---|
| **界面全面汉化** | 登录页、侧边栏、收件箱、邮件列表与详情、密钥页、设置页全部中文；`lang="zh-CN"`；时间显示为「3 分钟前」这类中文。专有名词（AgentBox、Cloudflare、字段名、MCP 工具名）保留原文 |
| **MCP 工具 7 → 14** | 新增 `search_messages`、`get_latest_message`、`clear_inbox`、`rename_inbox`、`inbox_stats`、`list_domains`、`create_inbox_on_domain` |
| **自动建箱** | D1 触发器 `auto_inbox_on_message`：任意地址收到第一封邮件时自动建收件箱，不用预先创建。见[自动建箱](#自动建箱) |
| **自动清理** | 按保留时长定时删信（3 分钟 / 30 分钟 / 1 小时 / 1 天 / 1 周 / 1 个月 / 自定义）。见[自动清理](#自动清理) |
| **字符集修复** | 上游把整封信按 UTF-8 解码，且忽略 MIME 的 `charset`，导致 GBK/Big5 邮件正文乱码。已改为按字节保存 + 按 part 声明的 charset 解码 |
| **删除入口可见性** | 收件箱的「更多」按钮原为 hover 才显示，触屏设备上等于不可见。已改为常驻 |

## 部署到 Vercel

最快的方式，无需本地环境：

> 在 Vercel 里 **New Project → 导入本仓库**，框架自动识别为 Next.js，然后在 Environment Variables 里填下面两个变量即可。

部署时填两个环境变量：

| 变量 | 怎么来的 |
|---|---|
| `CF_API_TOKEN` | 见[Cloudflare API 令牌](#cloudflare-api-令牌) |
| `AGENTBOX_SECRET` | 本地执行 `openssl rand -hex 32` |

部署完成后打开应用 → 创建管理员账号 → 设置 → 添加域名 → 初始化 → 完成。

> **自定义域名要指向 Vercel 且关闭代理。** `mail.yourdomain.com` 需 CNAME 到 Vercel 给出的目标，**proxied = false**；走 Cloudflare 橙云会让 Vercel 的域名校验失败。

## 环境要求

- **Node 22+**（Docker 镜像用 `node:22-alpine`）
- 一个 **托管在 Cloudflare 的域名**（zone 在本账户下且状态 active）
- 一个 **Cloudflare API 令牌**

用到的 Cloudflare 产品（Workers、D1、Email Routing）都在**免费额度**内，不需要信用卡。R2（附件存储）是可选项，需要绑卡，免费额度 10 GB/月。

## Cloudflare API 令牌

AgentBox 用**一个**令牌同时做两件事：初始化基础设施，以及运行时读写 D1。

1. 打开 [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. **Create Token** → **Create Custom Token** → **Get started**
3. 起个名字，比如 `agentbox`
4. 在 **Permissions** 里加下面几行：

   | # | 类型 | 资源 | 权限 |
   |---|---|---|---|
   | 1 | Account | **Workers Scripts** | **Edit** |
   | 2 | Account | **D1** | **Edit** |
   | 3 | Account | **Account Settings** | **Read** |
   | 4 | Zone | **Email Routing Rules**¹ | **Edit** |
   | 5 | Account | **Workers R2 Storage**² | **Edit** |

   ¹ 下拉里显示为 **Email Routing Rules**。
   ² **可选**。启用附件存储，需要账户绑卡。

5. **Account Resources** 选 **Include → 你的账户**
6. **Zone Resources** 选 **Include → Specific zone → 你的域名**
7. **Continue to summary** → **Create Token**
8. **立刻复制**，只显示一次

> **每项权限的用途**
> - **Workers Scripts → Edit** —— 上传、删除邮件 worker
> - **D1 → Edit** —— 建库、跑 schema、读写全部数据
> - **Account Settings → Read** —— 从令牌反查 account id
> - **Email Routing Rules → Edit** —— 为每个收件箱登记路由规则
> - **Workers R2 Storage → Edit**（可选）—— 自动建 `agentbox-attachments` 桶

> ⚠️ 初始化时报 `Authentication error`（code `10000`）通常是令牌缺权限，最常见是缺 **D1 → Edit**。

> **最小权限建议**：如果只想让 AgentBox 干活、不想给它整个账户的权限，可以把 Zone 资源精确到具体域名（本实例就是四个收信域各一条），Account 侧只给上面三项。注意**令牌不能管理令牌**（Cloudflare 硬限制），所以别指望用它造新令牌。

## 首次初始化

1. **环境变量**：`.env.local`（本地开发）或 Vercel / CF Pages 的项目设置

   ```bash
   CF_API_TOKEN=<你的 Cloudflare API 令牌>
   AGENTBOX_SECRET=<openssl rand -hex 32>
   ```

2. **安装并运行**

   ```bash
   npm install
   npm run dev          # http://localhost:3000
   # 或 npm run build && npm start
   ```

3. **首次启动向导**

   1. 打开应用 → **创建管理员账号**（存在 D1 里，bcrypt 加密）
   2. **设置 → 添加域名**（从你的 Cloudflare zone 里自动拉取）
   3. 点 **立即初始化** —— 自动建 D1 库并部署邮件 worker
   4. 在 Cloudflare 面板为每个域名**开启 Email Routing**：域名 → **Email** → **Email Routing** → **Enable**
   5. 完成，可以开始建收件箱了

> **关于第 4 步**：Cloudflare 的 `Email Routing Rules` 权限**不能**切换总开关，所以这一步通常要手动点。
> 但如果你手里有带 `Zone Settings Write` 的令牌，可以直接调
> `POST /zones/{zone}/email/routing/enable` 开，本实例实测可行。

## 多域名

AgentBox 可以同时为一个账户下的多个域名收信。在**设置**里添加域名即可，收件箱可以挂在任意一个上。

- 第一个添加的域名成为 **primary**，用于初始化共享的 D1 与 worker
- 其余域名复用同一个 worker，各自在自己的 zone 里登记路由规则
- 默认域名可以随时切换；侧边栏可以按域名筛选收件箱

> **建箱时指定域名**：`POST /v1/inboxes` 固定使用 primary 域名。
> 要在别的域名上建箱，用 MCP 的 `create_inbox_on_domain`，或先切 primary 再建。

## 自动建箱

上游的设计是「先建箱，再配一条 per-address 路由规则」。这带来一个问题：**没有建过的地址即使收到信，也不会出现在面板里**。

本 fork 加了一个 D1 触发器解决它：

```sql
CREATE TRIGGER auto_inbox_on_message AFTER INSERT ON messages
WHEN NOT EXISTS (SELECT 1 FROM inboxes WHERE address = NEW.address)
BEGIN
  INSERT INTO inboxes (id, address, label, route_id, owner_email, created_at, last_message_at)
  VALUES ('inbox_auto_' || lower(hex(randomblob(6))), NEW.address, 'auto', NULL,
          '<你的管理员邮箱>', NEW.received_at, NEW.received_at);
END;
```

效果：**任何地址收到第一封信就自动出现在面板里**，不用预先建箱。

| 字段 | 手建箱 | 自动箱 |
|---|---|---|
| `route_id` | 非空（登记了 Email Routing 规则） | **恒为 NULL** |
| `label` | 用户填的任意文本 | `auto` |

> **判据是 `route_id` 不是 `label`** —— label 是用户可随便填的自由文本，用它判断会误删手建箱。
> 自动清理也据此只删自动箱。

## 自动清理

在**设置 → 自动清理**里设保留时长，超期的邮件会被定时删除。

| 档位 | 说明 |
|---|---|
| 永久保留 | 默认，不清 |
| 3 / 30 分钟、1 小时、1 天、1 周、1 个月 | 固定档 |
| 自定义 | 填数字 + 选分钟／小时／天 |
| 关闭自动清理 | 一键关掉 |

实现方式：

- worker 增加 `scheduled()` 处理器，读 D1 `settings.retention_seconds`
- 保存策略时自动给 worker 装 `*/1 * * * *` 的 Cloudflare cron
- 每轮删除 `received_at < cutoff` 的邮件、清理孤儿附件、删除**静默超期的自动箱**

接口：`GET|PUT /api/retention`，body `{ "seconds": 1800 }`（`0` = 关闭，最小 60，上限 366 天）。

> **cron 粒度只有 1 分钟**，所以「3 分钟」档实际是 3–4 分钟生效。
> **邮件是直接从 D1 删掉的，没有回收站**，请设一个你能接受丢信的时长。
> 手建的收件箱永远不会被清理删掉，只有里面的邮件会过期。

## Docker

多阶段 `Dockerfile` 构建出 Next.js standalone 的非 root 小镜像。状态全在 Cloudflare D1，容器无状态，不需要挂卷。

```bash
# 用 compose 构建（推荐 —— 包含本 fork 的改动）
cp .env.example .env        # 填入 CF_API_TOKEN + AGENTBOX_SECRET
docker compose up -d --build
# → http://localhost:3000

# 或者纯 docker
docker build -t agentbox .
docker run -d -p 3000:3000 --env-file .env --name agentbox agentbox
```

> 上游有一个预构建镜像 `ghcr.io/mastomii/agentbox:0.1.0`，但**它不含本 fork 的改动**（汉化、自动清理、MCP 扩充、字符集修复）。要用这些特性就自己构建。

## 智能体 API（/v1）

鉴权：`Authorization: Bearer <api-key>`（也支持 `X-Api-Key` 头）。密钥在**API 密钥**页创建，只显示一次，之后只存 SHA-256 哈希。

### 1. 列出收件箱

```bash
curl "https://your-host/v1/inboxes?limit=20&address=swift-fox@yourdomain.com" \
  -H "Authorization: Bearer ab_..."
```

查询参数：`limit`（默认 50，最大 100）、`address`（精确匹配）

```json
{
  "inboxes": [
    {
      "id": "inbox_abc123",
      "address": "swift-fox-ab12@yourdomain.com",
      "label": "github-signup",
      "created_at": 1234567890,
      "last_message_at": 1234567890
    }
  ]
}
```

### 2. 创建收件箱

```bash
curl -X POST https://your-host/v1/inboxes \
  -H "Authorization: Bearer ab_..." \
  -H "Content-Type: application/json" \
  -d '{"label":"github-signup", "local":"swift-fox"}'
```

请求体（可选）：`label`（备注名）、`local`（自定义前缀，省略则随机）

```json
{ "id": "inbox_abc123", "address": "swift-fox@yourdomain.com" }
```

> 409 `exists` = 地址已被占用；409 `rule_limit_reached` = 单域路由规则到上限。
> **不支持指定域名**，固定用 primary；要用别的域名请走 MCP 的 `create_inbox_on_domain`。

### 3. 长轮询收信

```bash
curl "https://your-host/v1/inboxes/inbox_abc123/messages?wait=30" \
  -H "Authorization: Bearer ab_..."
```

查询参数：`wait`（秒，最大 55，长轮询）、`since`（epoch 毫秒）、`limit`（默认 100，最大 100）

```json
{
  "id": "inbox_abc123",
  "address": "swift-fox@yourdomain.com",
  "count": 1,
  "messages": [
    {
      "id": "msg_xyz789",
      "from": "sender@other.com",
      "fromName": "Sender",
      "to": "swift-fox@yourdomain.com",
      "subject": "Hello",
      "text": "Body text",
      "receivedAt": 1234567890
    }
  ]
}
```

### 4. 读完整邮件

```bash
curl https://your-host/v1/messages/msg_xyz789 \
  -H "Authorization: Bearer ab_..."
```

返回主题、纯文本、HTML、附件列表。

### 5. 标记已读

```bash
curl -X POST https://your-host/v1/messages/seen \
  -H "Authorization: Bearer ab_..." \
  -H "Content-Type: application/json" \
  -d '{"ids":["msg_xyz789"]}'
```

### 6. 删除邮件

```bash
curl -X DELETE https://your-host/v1/messages/msg_xyz789 \
  -H "Authorization: Bearer ab_..."
```

幂等。

### 7. 下载附件

需要 R2。直接返回字节流，不是 JSON。

```bash
curl https://your-host/v1/messages/msg_xyz789/attachments/att_abc \
  -H "Authorization: Bearer ab_..." -o invoice.pdf
```

### 8. 删除收件箱

会删掉 Cloudflare 路由规则，并清空该地址的所有邮件。

```bash
curl -X DELETE https://your-host/v1/inboxes/inbox_abc123 \
  -H "Authorization: Bearer ab_..."
```

## MCP 服务

MCP 原生客户端可以直接接一个 Streamable-HTTP 端点：

```
POST https://your-host/mcp
```

鉴权与 REST 完全一致：同一个 `Authorization: Bearer <api-key>`。

### 工具清单（14 个）

| 工具 | 说明 | 来源 |
|---|---|---|
| `list_inboxes` | 列出收件箱，可按地址精确筛选 | 上游 |
| `create_inbox` | 建收件箱（primary 域名） | 上游 |
| `delete_inbox` | 释放收件箱，删规则与邮件 | 上游 |
| `list_messages` | 列邮件，支持 `wait` 长轮询 | 上游 |
| `get_message` | 读一封完整邮件（含 HTML） | 上游 |
| `delete_message` | 删一封邮件 | 上游 |
| `mark_seen` | 批量标记已读 | 上游 |
| `get_attachment`¹ | 附件元数据 + 下载地址 | 上游 |
| **`search_messages`** | 按关键词搜发件人／主题／正文 | 本 fork |
| **`get_latest_message`** | 直接取最新一封，省去先 list 再挑 | 本 fork |
| **`clear_inbox`** | 清空邮件但保留地址与路由 | 本 fork |
| **`rename_inbox`** | 改备注名 | 本 fork |
| **`inbox_stats`** | 箱数／邮件数／未读数／各域分布 | 本 fork |
| **`list_domains`** | 列出可收信域名与默认域 | 本 fork |
| **`create_inbox_on_domain`** | 在指定域名上建箱 | 本 fork |

¹ 仅在启用 R2 附件存储时才出现在工具列表里。

### 接入 MCP 客户端

```json
{
  "mcpServers": {
    "agentbox": {
      "url": "https://your-host/mcp",
      "headers": { "Authorization": "Bearer ab_..." }
    }
  }
}
```

### 或直接用 JSON-RPC

```bash
curl -X POST https://your-host/mcp \
  -H "Authorization: Bearer ab_..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"create_inbox","arguments":{"label":"signup"}}}'
```

## 面板

- 三栏邮件界面：收件箱列表 / 邮件列表 / 正文
- 移动端自动切成单栏 + 抽屉
- 侧边栏按域名筛选
- 深浅主题切换
- API 密钥管理（创建时只显示一次）
- 设置页：域名管理、初始化、自动清理、清空全部资源

## 清理与重置

**设置 → 清空全部资源**（输入 `CLEANUP` 确认）会拆掉 AgentBox 在 Cloudflare 上创建的一切：

1. 删除它创建的每一条地址级路由规则
2. 删除邮件 worker
3. 删除 R2 桶与全部附件（若启用）
4. 删除 D1 库 —— **所有数据一起没**（用户、密钥、设置、收件箱、邮件）

之后自动退出登录，回到初始化向导。`CF_API_TOKEN` 仍在环境变量里，可以立刻重新初始化。

> ⚠️ 不可逆。D1 是唯一数据源，没有额外备份。

## 注意事项与限制

- **D1 免费额度**：5 GB 存储、500 万行读/天、10 万行写/天 —— 对智能体收件箱绰绰有余。新邮件几秒内可见。
- **单域收件箱上限**：走地址级路由规则时，Cloudflare Email Routing 每域名约 **200 条规则**。走 catch-all 则不受此限。
- **轮询**：面板每 30 秒拉一次邮件、60 秒拉一次收件箱列表，页面隐藏时暂停，对 D1 额度很温和。
- **保留时长**：默认不限，邮件留到你删除为止（或自动清理到期）。
- **只收不发**：不含发信/回信功能（那需要 MailChannels / Resend / SMTP）。AgentBox 是控制面 + 阅读器。
- **登录限流**：每 IP 每分钟 5 次。
- **Cloudflare 邮件路由总开关**：`Email Routing Rules` 权限开不了，需要 `Zone Settings Write` 或用面板手点。

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 16.2.11（App Router） |
| UI | React 19.2.4、Tailwind CSS v4、shadcn/ui、Radix UI |
| 语言 | TypeScript 5 |
| 数据 | Cloudflare D1（Serverless SQLite） |
| 收信 | Cloudflare Workers + Email Routing |
| 附件 | Cloudflare R2（可选） |
| 鉴权 | bcryptjs（密码）、jose（JWT 会话）、SHA-256（API 密钥） |
| 通知 | sonner |

## 目录结构

```
src/
├── app/
│   ├── (app)/              面板页面：收件箱、密钥、设置
│   ├── api/                面板内部接口（cookie 会话）
│   │   ├── auth/           登录、登出、首次初始化
│   │   ├── inboxes/        收件箱增删查
│   │   ├── keys/           API 密钥
│   │   ├── messages/       邮件与附件
│   │   ├── provision/      初始化与清理
│   │   ├── retention/      自动清理策略
│   │   └── settings/       域名与配置
│   ├── v1/                 智能体 API（Bearer 鉴权）
│   ├── mcp/                MCP Streamable-HTTP 端点
│   └── login/              登录页
├── components/
│   ├── mail/               三栏邮件界面
│   └── ui/                 shadcn 基础组件
└── lib/
    ├── cloudflare.ts       Cloudflare REST 封装（含 cron 管理）
    ├── d1.ts               D1 客户端与 schema
    ├── mail-store.ts       收件箱与邮件的存取
    ├── worker-template.ts  邮件 worker 源码（含 MIME 解析、定时清理）
    ├── auth.ts / apikey.ts 会话与密钥
    └── security.ts         密码强度、限流、规范化
tests/
└── security.test.mts       安全相关单测
```

## 许可证

本项目遵循 **MIT License**，与上游一致。

```
MIT License

Copyright (c) 2026 AgentBox

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

完整文本见 [LICENSE](LICENSE)。

### 上游与致谢

- 上游项目：[mastomii/agentbox](https://github.com/mastomii/agentbox)（MIT）
- 本 fork 的修改同样以 MIT 发布，原始版权声明保留

按 MIT 条款，你可以自由使用、修改、分发，包括商用，只需保留版权与许可声明。
