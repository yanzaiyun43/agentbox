"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, Cloud, Rocket, ExternalLink, Trash2, AlertTriangle, Plus, X, RefreshCw, Star, Paperclip, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CfDomain = { domain: string; zoneId: string; accountId: string };
type Zone = { domain: string; zoneId: string; accountId: string; emailRoutingEnabled?: boolean };

type Settings = {
  hasToken: boolean;
  configured: boolean;
  domain: string | null;
  accountId: string | null;
  zoneId: string | null;
  domains: CfDomain[];
  provisioned: boolean;
  r2Enabled: boolean;
  workerName: string | null;
  retentionSeconds: number;
};

type Step = { step: string; ok: boolean; detail?: string };

// Retention presets. `seconds: -1` marks the "custom" entry, which reads the
// number + unit inputs instead of a fixed value. 0 disables cleanup entirely.
const RETENTION_PRESETS: { key: string; label: string; seconds: number }[] = [
  { key: "off", label: "永久保留", seconds: 0 },
  { key: "3m", label: "3 分钟", seconds: 180 },
  { key: "30m", label: "30 分钟", seconds: 1800 },
  { key: "1h", label: "1 小时", seconds: 3600 },
  { key: "1d", label: "1 天", seconds: 86400 },
  { key: "1w", label: "1 周", seconds: 604800 },
  { key: "1mo", label: "1 个月", seconds: 2592000 },
  { key: "custom", label: "自定义…", seconds: -1 },
];

export default function SettingsPage() {
  const router = useRouter();
  const [s, setS] = useState<Settings | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [pickDomain, setPickDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [removeDomainOpen, setRemoveDomainOpen] = useState(false);
  const [pendingRemoveDomain, setPendingRemoveDomain] = useState<string | null>(null);
  const [settingPrimary, setSettingPrimary] = useState<string | null>(null);
  const [retentionPick, setRetentionPick] = useState<string>("off");
  const [retentionCustomValue, setRetentionCustomValue] = useState("1");
  const [retentionCustomUnit, setRetentionCustomUnit] = useState("hours");
  const [savingRetention, setSavingRetention] = useState(false);

  function load() {
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      setS(d);
      // Reflect the saved policy in the picker. A value that matches no preset
      // lands on "Custom…" with the inputs pre-filled, so it round-trips.
      const secs = Number(d?.retentionSeconds ?? 0) || 0;
      const hit = RETENTION_PRESETS.find((p) => p.seconds === secs);
      setRetentionPick(hit ? hit.key : secs > 0 ? "custom" : "off");
      if (secs > 0 && !hit) {
        if (secs % 86400 === 0) {
          setRetentionCustomUnit("days");
          setRetentionCustomValue(String(secs / 86400));
        } else if (secs % 3600 === 0) {
          setRetentionCustomUnit("hours");
          setRetentionCustomValue(String(secs / 3600));
        } else {
          setRetentionCustomUnit("minutes");
          setRetentionCustomValue(String(Math.max(1, Math.round(secs / 60))));
        }
      }
    });
  }
  useEffect(load, []);

  // Auto-fetch the zones available on the connected Cloudflare account so the
  // user picks from a dropdown instead of typing a domain by hand.
  const loadZones = useCallback((showSpinner = true) => {
    if (showSpinner) setZonesLoading(true);
    return fetch("/api/settings/zones")
      .then((r) => r.json())
      .then((d) => {
        if (d.zones) setZones(d.zones);
        if (d.error) toast.error(d.error);
      })
      .finally(() => setZonesLoading(false));
  }, []);
  // Auto-load once a token is present. Don't flip the spinner synchronously in
  // the effect (cascading-render lint) — let the fetch resolve it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (s?.hasToken) loadZones(false);
  }, [s?.hasToken, loadZones]);

  async function addDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!pickDomain) return;
    setSaving(true);
    const res = await fetch("/api/settings/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: pickDomain }),
    });
    setSaving(false);
    const d = await res.json();
    if (!res.ok) return toast.error(d.error || "操作失败");
    toast.success(`已添加 ${pickDomain}`);
    setPickDomain("");
    load();
  }

  function requestRemoveDomain(domain: string) {
    setPendingRemoveDomain(domain);
    setRemoveDomainOpen(true);
  }
  async function setPrimary(domain: string) {
    if (settingPrimary) return;
    setSettingPrimary(domain);
    try {
      const res = await fetch("/api/settings/domains", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const d = await res.json();
      if (!res.ok) return toast.error(d.error || "操作失败");
      toast.success(`${domain} 已设为默认`);
      load();
    } finally {
      setSettingPrimary(null);
    }
  }

  async function doRemoveDomain() {
    if (!pendingRemoveDomain) return;
    const domain = pendingRemoveDomain;
    setPendingRemoveDomain(null);
    setRemoveDomainOpen(false);
    const res = await fetch(`/api/settings/domains?domain=${encodeURIComponent(domain)}`, { method: "DELETE" });
    const d = await res.json();
    if (!res.ok) return toast.error(d.error || "操作失败");
    toast.success(`已移除 ${domain}`);
    load();
  }

  async function provision() {
    setProvisioning(true);
    setSteps([]);
    const res = await fetch("/api/provision", { method: "POST" });
    const d = await res.json();
    setProvisioning(false);
    setSteps(d.steps || []);
    if (d.ok) toast.success("初始化完成，邮件路由已生效。");
    else toast.error(d.error || "初始化失败");
    load();
  }

  async function saveRetention() {
    let seconds = 0;
    if (retentionPick === "custom") {
      const n = Number(retentionCustomValue);
      const mult = retentionCustomUnit === "days" ? 86400 : retentionCustomUnit === "hours" ? 3600 : 60;
      if (!Number.isFinite(n) || n <= 0) return toast.error("请输入一个正数");
      seconds = Math.round(n * mult);
    } else {
      const hit = RETENTION_PRESETS.find((p) => p.key === retentionPick);
      seconds = hit ? hit.seconds : 0;
    }
    setSavingRetention(true);
    const res = await fetch("/api/retention", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seconds }),
    });
    const d = await res.json();
    setSavingRetention(false);
    if (!res.ok) return toast.error(d.error || "操作失败");
    if (d.cronWarning) toast.warning(`已保存，但清理用的定时任务装不上：${d.cronWarning}`);
    else toast.success(seconds > 0 ? "保留策略已保存" : "已关闭自动清理");
    load();
  }

  async function cleanup() {
    setCleaning(true);
    setSteps([]);
    const res = await fetch("/api/provision/cleanup", { method: "POST" });
    const d = await res.json();
    setCleaning(false);
    setCleanupOpen(false);
    setConfirmText("");
    setSteps(d.steps || []);
    if (d.ok) {
      // KV (incl. users) wiped + session destroyed server-side → back to setup.
      toast.success("已清空，正在退出登录…");
      router.push("/login");
      router.refresh();
      return;
    }
    toast.error(d.error || "清空失败");
    load();
  }

  return (
    <>
      <PageHeader title="设置" description="连接 Cloudflare，把邮件基础设施铺好。" />
      <div className="flex-1 overflow-y-auto">
       <div className="w-full space-y-6 p-8 animate-in fade-in slide-in-from-bottom-3 duration-300">
        <Card className="rounded-lg">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-orange-500/25 bg-orange-500/10 text-orange-400">
                <Cloud className="h-[22px] w-[22px]" />
              </div>
              <CardTitle className="text-xs font-bold uppercase tracking-tight">Cloudflare 连接</CardTitle>
              {s?.configured && (
                <Badge className="ml-auto gap-1.5 border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" variant="outline">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Connected
                </Badge>
              )}
            </div>
            <CardDescription>
              API 令牌从环境变量 <code className="rounded bg-muted px-1 py-0.5 text-xs">CF_API_TOKEN</code> 读取。
              挑一个或多个域名（本账户下已接入的 zone）来收信 —— 收件箱可以挂在任意一个上。{" "}
              <a className="inline-flex items-center gap-0.5 underline" href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">
                管理令牌 <ExternalLink className="h-3 w-3" />
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!s?.hasToken && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
                <span>服务器上没有设置 <code className="font-mono">CF_API_TOKEN</code>。请加进环境变量后重新部署。</span>
              </div>
            )}
            {/* Domains added so far. The first one is the primary (provisioning target). */}
            {(s?.domains?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <Label>已接入域名</Label>
                <div className="space-y-1.5">
                  {s!.domains.map((d, i) => (
                    <div key={d.domain} style={{ animationDelay: `${i * 40}ms` }} className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm animate-in fade-in slide-in-from-left-2 duration-300 fill-mode-both">
                      <Cloud className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono">{d.domain}</span>
                      {d.domain === s!.domain && (
                        <Badge variant="outline" className="ml-1 gap-1 text-xs">
                          <Star className="h-3 w-3 fill-current" /> 默认
                        </Badge>
                      )}
                      <span className="ml-auto font-mono text-xs text-muted-foreground">{d.zoneId.slice(0, 8)}…</span>
                      {d.domain !== s!.domain && (
                        <>
                          <Button variant="ghost" size="icon" className="h-6 w-6" title="设为默认" disabled={!!settingPrimary} onClick={() => setPrimary(d.domain)}>
                            {settingPrimary === d.domain ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" title="移除域名" disabled={!!settingPrimary} onClick={() => requestRemoveDomain(d.domain)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add a domain: auto-fetched zone selectbox. */}
            <form onSubmit={addDomain} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="domain">添加域名</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" disabled={!s?.hasToken || zonesLoading} onClick={() => loadZones()}>
                  <RefreshCw className={zonesLoading ? "h-3 w-3 animate-spin" : "h-3 w-3"} /> 刷新
                </Button>
              </div>
              <div className="flex gap-2">
                <Select value={pickDomain} onValueChange={setPickDomain} disabled={!s?.hasToken || zonesLoading}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={zonesLoading ? "正在加载域名…" : "选择一个 Cloudflare 域名"} />
                  </SelectTrigger>
                  <SelectContent>
                    {zones
                      .filter((z) => !s?.domains?.some((d) => d.domain === z.domain))
                      .map((z) => (
                        <SelectItem key={z.zoneId} value={z.domain}>{z.domain}</SelectItem>
                      ))}
                    {zones.filter((z) => !s?.domains?.some((d) => d.domain === z.domain)).length === 0 && (
                      <div className="px-2 py-3 text-center text-xs text-muted-foreground">没有可添加的域名</div>
                    )}
                  </SelectContent>
                </Select>
                <Button type="submit" disabled={saving || !s?.hasToken || !pickDomain}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  这里列出账户下所有 zone。如果某个域名在初始化后收不到信，请手动为它开启{" "}
                  <span className="font-medium">邮件路由（Email Routing）</span>：{" "}
                  <a className="inline-flex items-center gap-0.5 underline" href="https://dash.cloudflare.com/?to=/:account/:zone/email/routing" target="_blank" rel="noreferrer">
                    Cloudflare → Email → Email Routing <ExternalLink className="h-3 w-3" />
                  </a>，然后点刷新。
                </span>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-500/25 bg-blue-500/10 text-blue-400">
                <Rocket className="h-[22px] w-[22px]" />
              </div>
              <CardTitle className="text-xs font-bold uppercase tracking-tight">资源初始化</CardTitle>
              {s?.provisioned && (
                <>
                  <Badge className="ml-auto gap-1.5 border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" variant="outline">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </span>
                    运行中
                  </Badge>
                  <Badge className={`gap-1.5 ${s.r2Enabled ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400"}`} variant="outline">
                    <Paperclip className="h-3 w-3" />
                    {s.r2Enabled ? "附件已启用" : "附件未启用"}
                  </Badge>
                </>
              )}
            </div>
            <CardDescription>
              一键完成：建 D1 数据库并部署邮件 Worker。每个域名都需要先在 Cloudflare 面板里{" "}
              <span className="font-medium">手动开启</span>邮件路由（见上）。开启后，每建一个收件箱就会自动登记一条路由规则（单域上限 200 条）。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={provision} disabled={!s?.configured || provisioning || cleaning}>
                {provisioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {s?.provisioned ? "重新部署 Worker" : "立即初始化"}
              </Button>

              <Dialog open={cleanupOpen} onOpenChange={(o) => { setCleanupOpen(o); if (!o) setConfirmText(""); }}>
                <DialogTrigger asChild>
                  <Button variant="destructive" disabled={!s?.configured || !s?.provisioned || provisioning || cleaning}>
                    {cleaning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    清空全部资源
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" /> 销毁 AgentBox 创建的全部资源？
                    </DialogTitle>
                    <DialogDescription asChild>
                      <div className="space-y-3 pt-1">
                        <p className="font-medium text-foreground">此操作不可撤销。</p>
                        <p>将删除以下 Cloudflare 资源：</p>
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                          <li><span className="font-mono">{s?.domain || "yourdomain"}</span> 的全部地址级路由规则 —— 新邮件会立刻停止投递</li>
                          <li>Worker <span className="font-mono">agentbox-email</span></li>
                          <li>R2 存储桶及全部已存附件（若已启用）</li>
                          <li>D1 数据库 —— 包括<b>全部已存邮件</b>、收件箱与账号</li>
                        </ul>
                        <p className="text-sm">
                          Cloudflare API 令牌与域名配置会保留，之后可以重新初始化一套干净的。
                        </p>
                      </div>
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Label htmlFor="confirm" className="text-sm">
                      输入 <span className="font-mono font-semibold text-destructive">CLEANUP</span> 以确认
                    </Label>
                    <Input
                      id="confirm"
                      autoComplete="off"
                      placeholder="CLEANUP"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      disabled={cleaning}
                    />
                  </div>
                  <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-2">
                    <Button variant="ghost" onClick={() => setCleanupOpen(false)} disabled={cleaning}>取消</Button>
                    <Button variant="destructive" onClick={cleanup} disabled={cleaning || confirmText !== "CLEANUP"}>
                      {cleaning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      销毁全部
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            {steps.length > 0 && (
              <div className="space-y-1.5 rounded-md border p-3 text-sm">
                {steps.map((st, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {st.ok ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <span className="h-4 w-4 rounded-full bg-destructive" />}
                    <span>{st.step}</span>
                    {st.detail && <span className="ml-auto truncate font-mono text-xs text-muted-foreground">{st.detail}</span>}
                  </div>
                ))}
              </div>
            )}
            <Separator />
            <p className="text-xs text-muted-foreground">
              D1, Workers, and Email Routing are on Cloudflare&apos;s free tier and do not require a credit card.
              Attachment storage (R2) is auto-provisioned when available — R2 is free up to 10 GB/month but requires a credit card on file.
            </p>
          
      {/* Remove domain confirmation */}
      <Dialog open={removeDomainOpen} onOpenChange={setRemoveDomainOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Remove domain
            </DialogTitle>
            <DialogDescription>
              确定要移除 <span className="font-mono font-medium text-foreground">{pendingRemoveDomain}</span>? 
              该域名的全部邮件路由规则都会被删除，且不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <Button variant="outline" onClick={() => setRemoveDomainOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={doRemoveDomain}>移除域名</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
</CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/10 text-violet-400">
                <Clock className="h-[22px] w-[22px]" />
              </div>
              <CardTitle className="text-xs font-bold uppercase tracking-tight">自动清理</CardTitle>
              {s?.retentionSeconds ? (
                <Badge className="ml-auto gap-1.5 border-violet-500/30 bg-violet-500/15 text-violet-600 dark:text-violet-400" variant="outline">
                  {RETENTION_PRESETS.find((p) => p.seconds === s.retentionSeconds)?.label ??
                    `${Math.round(s.retentionSeconds / 60)} 分钟`}
                </Badge>
              ) : (
                <Badge className="ml-auto gap-1.5" variant="outline">关闭</Badge>
              )}
            </div>
            <CardDescription>
              邮件超过设定时长后自动删除。清理由 Cloudflare 的一分钟定时任务执行，
              所以实际生效时间 = 你设的时长 + 最多一分钟。
              手动创建的收件箱会保留；自动创建的会随邮件一起消失。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>邮件保留时长</Label>
              <Select value={retentionPick} onValueChange={setRetentionPick} disabled={savingRetention}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RETENTION_PRESETS.map((p) => (
                    <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {retentionPick === "custom" && (
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="ret-n">数量</Label>
                  <Input
                    id="ret-n"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={retentionCustomValue}
                    onChange={(e) => setRetentionCustomValue(e.target.value)}
                    disabled={savingRetention}
                  />
                </div>
                <div className="w-36 space-y-2">
                  <Label>单位</Label>
                  <Select value={retentionCustomUnit} onValueChange={setRetentionCustomUnit} disabled={savingRetention}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">分钟</SelectItem>
                      <SelectItem value="hours">小时</SelectItem>
                      <SelectItem value="days">天</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={saveRetention} disabled={savingRetention || !s?.configured}>
                {savingRetention && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存策略
              </Button>
              {s?.retentionSeconds ? (
                <Button
                  variant="outline"
                  disabled={savingRetention}
                  onClick={() => {
                    setRetentionPick("off");
                    // Save immediately: "Keep forever" is the safe default.
                    setSavingRetention(true);
                    fetch("/api/retention", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ seconds: 0 }),
                    })
                      .then((r) => r.json())
                      .then((d) => {
                        if (d.error) toast.error(d.error);
                        else toast.success("已关闭自动清理");
                        load();
                      })
                      .finally(() => setSavingRetention(false));
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  关闭自动清理
                </Button>
              ) : null}
            </div>

            <p className="text-xs text-muted-foreground">
              定时触发器会在你首次保存策略时装到 <span className="font-mono">agentbox-email</span> Worker 上。邮件直接从 D1 删除——没有回收站，所以请设一个你能接受丢信的时长。
            </p>
          </CardContent>
        </Card>
       </div>
      </div>
    </>
  );
}
