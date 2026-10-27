"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Eye, EyeOff, Bot, Inbox, ShieldCheck, Cloud } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const FEATURES = [
  { icon: Inbox, title: "按需收件箱", desc: "在你的域名下随手开地址，每个地址各自独立收信。", tint: "text-blue-400 border-blue-500/25 bg-blue-500/10" },
  { icon: Bot, title: "为智能体而生", desc: "用一套简单的 REST API 创建收件箱、轮询收信。", tint: "text-purple-400 border-purple-500/25 bg-purple-500/10" },
  { icon: Cloud, title: "Cloudflare 原生", desc: "Workers、D1 与邮件路由，全程免费额度内。", tint: "text-emerald-400 border-emerald-500/25 bg-emerald-500/10" },
];

export default function LoginPage() {
  const router = useRouter();
  // finding 6: the setup probe is detection of a live backend state, not a
  // constant. Keep the probe as a re-checkable flow ({ state, needsSetup })
  // instead of a one-shot boolean: a rejected probe means "unknown" (offer a
  // retry), never "already set up", and submit() re-detects before choosing
  // the endpoint so a stale mount-time answer can't misroute the credentials.
  const [probe, setProbe] = useState<{ state: "loading" | "error" | "ready"; needsSetup: boolean | null }>({
    state: "loading",
    needsSetup: null,
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    detectSetup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Parse the GET /api/auth/setup response into a tri-state flag:
  //true = no admin account yet,false = already configured, null = unknown
  // (probe failed). Callers always probe the live endpoint; nothing is cached.
  async function readSetupState(res: Response): Promise<boolean | null> {
    if (!res.ok) return null;
    const d = (await res.json().catch(() => null)) as { needsSetup?: unknown } | null;
    return typeof d?.needsSetup === "boolean" ? d.needsSetup : null;
  }

  // Mount-time probe (also used by the Retry button). Populates the form's
  // visible mode; a failure surfaces the recoverable error state.
  async function detectSetup(): Promise<void> {
    setProbe((p) => ({ state: "loading", needsSetup: p.needsSetup }));
    let needsSetup: boolean | null = null;
    try {
      needsSetup = await readSetupState(await fetch("/api/auth/setup"));
    } catch {
      needsSetup = null;
    }
    if (needsSetup === null) {
      setProbe({ state: "error", needsSetup: null });
    } else {
      setProbe({ state: "ready", needsSetup });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // finding 6: re-detect before submitting. The mount-time answer can be
    // stale (a second tab completed the one-time setup) or missing (the probe
    // failed); never route credentials on a frozen flag. Probe the endpoint
    // again here, at submit time, against the live backend state.
    let detected: boolean | null = null;
    try {
      detected = await readSetupState(await fetch("/api/auth/setup"));
    } catch {
      detected = null;
    }
    if (detected === null) {
      setLoading(false);
      setProbe({ state: "error", needsSetup: null });
      toast.error("连不上服务器，请检查网络后重试。");
      return;
    }
    setProbe({ state: "ready", needsSetup: detected });
    const url = detected ? "/api/auth/setup" : "/api/auth/login";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "操作失败");
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <Logo size={40} className="h-10 w-10 shrink-0 rounded-xl shadow-lg shadow-blue-500/25" />
          <div>
            <span className="text-lg font-bold tracking-tight">AgentBox</span>
            <p className="text-xs font-medium leading-none text-slate-500">面向 AI 智能体的邮箱</p>
          </div>
        </div>

        <div className="relative max-w-lg space-y-8">
          <div className="space-y-4">
            <h2 className="text-4xl font-bold leading-tight tracking-tight">
              为你的 AI 智能体准备的邮箱。
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              自建、开源、免费。一键在 Cloudflare 上
              铺好整套邮件系统。
            </p>
          </div>
          <ul className="space-y-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-4 rounded-xl border border-border bg-card p-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${f.tint}`}>
                  <f.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="mb-0.5 text-xs font-bold">{f.title}</div>
                  <div className="text-xs text-muted-foreground">{f.desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-blue-500" />
          无需信用卡 · Cloudflare 免费额度
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-background p-6 sm:p-12">
        <div className="w-full max-w-sm">
          {/* mobile brand */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo size={36} />
            <span className="text-lg font-semibold tracking-tight">AgentBox</span>
          </div>

          {probe.state === "loading" ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
                <div className="h-4 w-56 animate-pulse rounded-md bg-muted" />
              </div>
              <div className="space-y-4">
                <div className="h-10 animate-pulse rounded-md bg-muted" />
                <div className="h-10 animate-pulse rounded-md bg-muted" />
                <div className="h-10 animate-pulse rounded-md bg-muted" />
              </div>
            </div>
          ) : probe.state === "error" ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <h1 className="text-2xl font-semibold tracking-tight">连不上服务器</h1>
                <p className="text-sm text-muted-foreground">
                  AgentBox 无法确认管理员账号是否已创建。
                </p>
              </div>
              <Button className="w-full" onClick={() => void detectSetup()}>
                重试
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-6 space-y-1.5">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {probe.needsSetup ? "创建管理员账号" : "欢迎回来"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {probe.needsSetup
                    ? "设置管理员凭据，为面板上锁。"
                    : "登录以管理你的智能体收件箱。"}
                </p>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">邮箱</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">密码</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={show ? "text" : "password"}
                      autoComplete={probe.needsSetup ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={show ? "隐藏密码" : "显示密码"}
                      tabIndex={-1}
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {probe.needsSetup && (
                    <p className="text-xs text-muted-foreground">长度 12–128 个字符。</p>
                  )}
                </div>

                <Button type="submit" className="mt-2 w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {probe.needsSetup ? "创建账号并继续" : "登录"}
                </Button>
              </form>

              <p className="mt-6 text-center text-xs text-muted-foreground">
                {probe.needsSetup
                  ? "这是唯一账号，请妥善保管凭据。"
                  : "自建 AgentBox · 数据留在你自己的服务器上。"}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
