"use client";

import { useEffect, useState } from "react";
import { Plus, Copy, Trash2, KeyRound, Check, Terminal, ShieldCheck, Loader2, Plug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";

type Key = { id: string; name: string; prefix: string; created_at: number; last_used_at: number | null };

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-7 w-7 shrink-0"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setDone(true);
        toast.success("已复制");
        setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

function Terminal_({ cmd }: { cmd: string }) {
  // very light shell highlighting: dim flags + comments, accent the URL
  return (
    <code className="block whitespace-pre-wrap break-all font-mono text-sm leading-relaxed">
      {cmd.split("\n").map((line, i) => (
        <span key={i} className="block">
          {line.split(/(\s+)/).map((tok, j) => {
            if (tok.startsWith("-")) return <span key={j} className="text-muted-foreground">{tok}</span>;
            if (/^https?:\/\//.test(tok) || tok.startsWith('"http')) return <span key={j} className="text-primary">{tok}</span>;
            if (tok === "curl") return <span key={j} className="font-semibold text-emerald-500">{tok}</span>;
            return <span key={j}>{tok}</span>;
          })}
        </span>
      ))}
    </code>
  );
}

function Step({ n, title, cmd, result }: { n: number; title: string; cmd: string; result?: string }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {n}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm font-medium">{title}</p>
        <div className="group relative overflow-hidden rounded-lg border bg-muted/40">
          <div className="absolute right-1.5 top-1.5 z-10 opacity-0 transition-opacity group-hover:opacity-100">
            <CopyButton text={cmd} />
          </div>
          <div className="overflow-x-auto p-3 pr-10">
            <Terminal_ cmd={cmd} />
          </div>
          {result && (
            <div className="border-t bg-background/40 px-3 py-2">
              <code className="block whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
                <span className="text-emerald-500/80">→</span> {result}
              </code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Param = { name: string; type: string; required?: boolean; desc: string };

function Endpoint({
  method, path, desc, query, body, response,
}: {
  method: string; path: string; desc: string;
  query?: Param[]; body?: Param[]; response?: string;
}) {
  const tint =
    method === "POST" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
    : method === "DELETE" ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
    : "bg-blue-500/10 text-blue-500 border-blue-500/20";
  return (
    <div className="overflow-hidden rounded-lg border bg-muted">
      <div className="flex items-center gap-3 border-b bg-secondary/40 px-3.5 py-2.5">
        <span className={`rounded border px-1.5 py-0.5 text-xs font-extrabold uppercase ${tint}`}>{method}</span>
        <code className="font-mono text-xs font-bold">{path}</code>
      </div>
      <div className="space-y-3 p-3.5">
        <p className="text-xs leading-normal text-muted-foreground">{desc}</p>
        {query && <ParamTable label="查询参数" rows={query} />}
        {body && <ParamTable label="请求体（JSON）" rows={body} />}
        {response && (
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">响应 200</p>
            <pre className="overflow-x-auto rounded-lg border bg-secondary/40 p-2.5 font-mono text-xs leading-relaxed text-muted-foreground">{response}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

function ParamTable({ label, rows }: { label: string; rows: Param[] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="space-y-1.5">
        {rows.map((p) => (
          <div key={p.name} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
            <code className="font-mono font-semibold text-foreground">{p.name}</code>
            <span className="font-mono text-xs text-blue-500">{p.type}</span>
            {p.required
              ? <span className="text-xs font-bold uppercase text-rose-500">必填</span>
              : <span className="text-xs font-bold uppercase text-slate-500">可选</span>}
            <span className="w-full text-muted-foreground sm:w-auto sm:flex-1">{p.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function KeysPage() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [domain, setDomain] = useState("yourdomain.com");
  const [base, setBase] = useState("https://your-host");
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  function load() {
    fetch("/api/keys").then((r) => r.json()).then((d) => setKeys(d.keys));
  }
  useEffect(() => {
    load();
    queueMicrotask(() => setBase(window.location.origin));
    fetch("/api/settings").then((r) => r.json()).then((d) => d?.domain && setDomain(d.domain));
  }, []);

  async function create() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await res.json();
      setCreated(d.key.key);
      setName("");
      load();
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (revoking) return;
    setRevoking(id);
    try {
      await fetch(`/api/keys/${id}`, { method: "DELETE" });
      toast.success("密钥已吊销");
      load();
    } finally {
      setRevoking(null);
    }
  }

  return (
    <>
      <PageHeader title="API 密钥" description="给 AI 智能体访问 /v1 接口用的 Bearer 令牌。">
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setCreated(null); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> 新建密钥</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{created ? "密钥已创建" : "创建 API 密钥"}</DialogTitle>
              <DialogDescription>
                {created
                  ? "现在就复制走——出于安全，密钥不会再显示第二次。"
                  : "Generate a token for an AI agent to access inboxes via the /v1 API."}
              </DialogDescription>
            </DialogHeader>
            {created ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
                <code className="flex-1 truncate text-sm">{created}</code>
                <CopyButton text={created} />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="kn">名称</Label>
                <Input id="kn" placeholder="例如 signup-agent" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
            )}
            <DialogFooter>
              {created ? (
                <Button onClick={() => { setOpen(false); setCreated(null); }}><Check className="mr-1.5 h-4 w-4" /> 完成</Button>
              ) : (
                <Button onClick={create} disabled={!name.trim() || creating}>
                  {creating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}创建密钥
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="flex-1 overflow-y-auto">
        <div className="w-full space-y-6 p-8 animate-in fade-in slide-in-from-bottom-3 duration-300">
          {/* Active keys */}
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="text-xs font-bold uppercase tracking-tight">有效密钥</CardTitle>
              <CardDescription className="text-xs">用法 <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-blue-500">Authorization: Bearer &lt;key&gt;</code></CardDescription>
            </CardHeader>
            <CardContent>
              {keys.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                    <KeyRound className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">还没有 API 密钥</p>
                  <p className="mb-4 mt-1 max-w-xs text-xs text-muted-foreground">
                    创建一个密钥，你的 AI 智能体就能建收件箱、读邮件。
                  </p>
                  <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" /> 创建第一个密钥
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {keys.map((k, i) => (
                    <div key={k.id} style={{ animationDelay: `${i * 40}ms` }} className="flex items-center gap-3 rounded-lg border border-border bg-muted p-3 transition-colors animate-in fade-in slide-in-from-left-2 duration-300 fill-mode-both hover:border-border hover:bg-accent/40">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <KeyRound className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{k.name}</span>
                          {k.last_used_at ? (
                            <Badge variant="outline" className="h-5 gap-1 border-emerald-500/30 bg-emerald-500/15 text-xs text-emerald-600 dark:text-emerald-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />活跃
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="h-5 border-amber-500/30 bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400">未使用</Badge>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{k.prefix}…</code>
                          <span>·</span>
                          <span>
                            {k.last_used_at
                              ? `最后使用 ${new Date(k.last_used_at).toLocaleDateString("zh-CN")}`
                              : `创建于 ${new Date(k.created_at).toLocaleDateString("zh-CN")}`}
                          </span>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" disabled={revoking === k.id} onClick={() => revoke(k.id)}>
                        {revoking === k.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Endpoint reference */}
          <Card className="rounded-lg">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-blue-500" />
                <CardTitle className="text-xs font-bold uppercase tracking-tight">智能体 API 参考</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Base URL <code className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-xs text-blue-500">{base}/v1</code>{" "}
                · every request needs <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">Authorization: Bearer &lt;key&gt;</code>{" "}
                · 所有时间戳均为 epoch 毫秒。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Endpoint
                method="GET" path="/v1/inboxes"
                desc="列出收件箱，按时间倒序。"
                query={[
                  { name: "limit", type: "number", desc: "返回条数上限，默认 50，最大 100。" },
                  { name: "address", type: "string", desc: "按地址精确匹配筛选。" },
                ]}
                response={`{
  "inboxes": [
    { "id": "inbox_ab12cd34", "address": "swift-fox-9a@${domain}",
      "label": "signup", "created_at": 1730000000000,
      "last_message_at": 1730000500000 }
  ]
}`}
              />
              <Endpoint
                method="POST" path="/v1/inboxes"
                desc={`Create an inbox. With an empty body you get a random address (e.g. swift-fox-9a@${domain}). Pass "local" to choose the part before the @.`}
                body={[
                  { name: "local", type: "string", desc: "@ 前面的地址段，会被规范化为 [a-z0-9._-]。留空则随机。" },
                  { name: "label", type: "string", desc: "可选备注名，存在收件箱上。" },
                ]}
                response={`{ "id": "inbox_ab12cd34",
  "address": "support-bot@${domain}" }

// 409 { "error": "exists" }            address taken
// 409 { "error": "rule_limit_reached" } 200 routes/domain`}
              />
              <Endpoint
                method="DELETE" path="/v1/inboxes/{id}"
                desc="释放收件箱：删除它的路由规则（腾出单域 200 条中的一个名额），并清空已存邮件。幂等。"
                response={`{ "ok": true, "id": "inbox_ab12cd34" }

// 404 { "error": "unknown inbox" }`}
              />
              <Endpoint
                method="GET" path="/v1/inboxes/{id}/messages"
                desc="列出该收件箱的邮件，按时间倒序。用 wait 长轮询等新邮件到达——刚触发注册/验证码邮件时最有用。"
                query={[
                  { name: "wait", type: "number", desc: "长轮询等待新邮件的秒数（最大 55）。一旦有邮件命中就提前返回。默认 0 = 立即返回。" },
                  { name: "since", type: "number", desc: "只返回在此 epoch 毫秒之后收到的邮件。" },
                  { name: "limit", type: "number", desc: "返回邮件数上限，默认 100，最大 100。" },
                ]}
                response={`{
  "id": "inbox_ab12cd34",
  "address": "swift-fox-9a@${domain}",
  "count": 1,
  "messages": [
    { "id": "msg_77f0", "from": "no-reply@stripe.com",
      "fromName": "Stripe", "to": "swift-fox-9a@${domain}",
      "subject": "Your code is 123456",
      "text": "Your verification code is 123456",
      "receivedAt": 1730000500000 }
  ]
}`}
              />
              <Endpoint
                method="GET" path="/v1/messages/{id}"
                desc="取一封邮件的完整内容，含 HTML 正文（列表接口为省流量不返回 html）。"
                response={`{
  "message": { "id": "msg_77f0",
    "from": "no-reply@stripe.com", "fromName": "Stripe",
    "to": "swift-fox-9a@${domain}",
    "subject": "Your code is 123456",
    "text": "Your verification code is 123456",
    "html": "<html>…</html>",
    "receivedAt": 1730000500000 }
}`}
              />
              <Endpoint
                method="POST" path="/v1/messages/seen"
                desc="把一封或多封邮件标记为已读。"
                body={[
                  { name: "ids", type: "string[]", required: true, desc: "要标记为已读的邮件 id。" },
                ]}
                response={`{ "ok": true, "count": 1 }`}
              />
              <Endpoint
                method="DELETE" path="/v1/messages/{id}"
                desc="删除一封已存邮件。幂等。"
                response={`{ "ok": true, "id": "msg_77f0" }`}
              />
              <Endpoint
                method="GET" path="/v1/messages/{id}/attachments/{aid}"
                desc="从 R2 流式下载附件（需启用 R2）。返回带 Content-Disposition 的原始字节而非 JSON。附件 id 取自邮件的 attachments 数组。"
                response={`<二进制> — Content-Type 与文件名取自已存附件`}
              />
            </CardContent>
          </Card>

          {/* Quickstart — the same endpoints stitched into one runnable flow */}
          <Card className="rounded-lg">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-500" />
                <CardTitle className="text-xs font-bold uppercase tracking-tight">快速上手</CardTitle>
              </div>
              <CardDescription>可直接复制的流程：建收件箱 → 长轮询等信 → 读正文 → 释放收件箱。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Step
                n={1}
                title="创建收件箱"
                cmd={`curl -X POST ${base}/v1/inboxes \\\n  -H "Authorization: Bearer ab_..." \\\n  -H "Content-Type: application/json" \\\n  -d '{"label":"signup"}'`}
                result={`{ "id": "inbox_abc123", "address": "swift-fox-ab12@${domain}" }`}
              />
              <Step
                n={2}
                title="长轮询等信（最多等 30 秒）"
                cmd={`curl "${base}/v1/inboxes/inbox_abc123/messages?wait=30" \\\n  -H "Authorization: Bearer ab_..."`}
                result={`{ "count": 1, "messages": [ { "id": "msg_77f0", "subject": "Your code is 123456", ... } ] }`}
              />
              <Step
                n={3}
                title="读完整邮件（含 HTML）"
                cmd={`curl ${base}/v1/messages/msg_77f0 \\\n  -H "Authorization: Bearer ab_..."`}
              />
              <Step
                n={4}
                title="用完释放收件箱"
                cmd={`curl -X DELETE ${base}/v1/inboxes/inbox_abc123 \\\n  -H "Authorization: Bearer ab_..."`}
                result={`{ "ok": true, "id": "inbox_abc123" }`}
              />
            </CardContent>
          </Card>

          {/* MCP — same auth, same tools, for MCP-native agents */}
          <Card className="rounded-lg">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Plug className="h-4 w-4 text-blue-500" />
                <CardTitle className="text-xs font-bold uppercase tracking-tight">MCP 服务</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Streamable-HTTP endpoint <code className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-xs text-blue-500">{base}/mcp</code>{" "}
                · same <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">Authorization: Bearer &lt;key&gt;</code> auth{" "}
                · 把 /v1 的全部操作以 MCP 工具形式暴露出来。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">工具</p>
                <div className="flex flex-wrap gap-1.5">
                  {["list_inboxes", "create_inbox", "create_inbox_on_domain", "delete_inbox", "rename_inbox", "clear_inbox", "list_messages", "get_message", "get_latest_message", "search_messages", "delete_message", "mark_seen", "inbox_stats", "list_domains", "get_attachment"].map((t) => (
                    <code key={t} className="rounded border bg-secondary/40 px-1.5 py-0.5 font-mono text-xs">{t}</code>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  <code className="font-mono">get_attachment</code> 仅在启用 R2 附件存储时才会出现在列表里。
                </p>
              </div>
              <Step
                n={1}
                title="加入 MCP 客户端（Claude Code、Cursor 等）"
                cmd={`{\n  "mcpServers": {\n    "agentbox": {\n      "url": "${base}/mcp",\n      "headers": { "Authorization": "Bearer ab_..." }\n    }\n  }\n}`}
              />
              <Step
                n={2}
                title="或直接用 JSON-RPC 调用"
                cmd={`curl -X POST ${base}/mcp \\\n  -H "Authorization: Bearer ab_..." \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}
                result={`{ "result": { "tools": [ { "name": "list_inboxes", ... } ] } }`}
              />
              <Step
                n={3}
                title="调用工具"
                cmd={`curl -X POST ${base}/mcp \\\n  -H "Authorization: Bearer ab_..." \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"create_inbox","arguments":{"label":"signup"}}}'`}
                result={`{ "result": { "content": [ { "type": "text",
  "text": "{ \\"id\\": \\"inbox_abc123\\", \\"address\\": \\"swift-fox-ab12@${domain}\\" }" } ] } }`}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
