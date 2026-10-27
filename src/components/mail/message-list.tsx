"use client";

import { useEffect, useState } from "react";
import { RefreshCw, MailOpen, Copy, ChevronLeft, Trash2, CheckSquare, X, MailCheck, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Inbox, MessageSummary } from "./types";
import { timeAgo, initials } from "./types";

export function MessageList({
  inbox, messages, loading, activeMsg, onSelect, onRefresh, onBack, onBulkDelete, onMarkRead,
}: {
  inbox: Inbox | null;
  messages: MessageSummary[];
  loading: boolean;
  activeMsg: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onBack: () => void;
  onBulkDelete: (ids: string[]) => void | Promise<void>;
  onMarkRead: (ids: string[], seen: boolean) => void | Promise<void>;
}) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<null | "delete" | "read">(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<"single" | "bulk">("single");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // reset selection when switching inbox / leaving select mode
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting state on prop change
    setSelectMode(false);
    setSelected(new Set());
  }, [inbox?.id]);

  if (!inbox) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Select an inbox to view its messages
      </div>
    );
  }

  const unread = messages.filter((m) => !m.seen).length;
  const allSelected = messages.length > 0 && selected.size === messages.length;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(messages.map((m) => m.id)));
  }
  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }
  function requestBulkDelete() {
    if (busy || !selected.size) return;
    setConfirmTarget("bulk");
    setConfirmOpen(true);
  }
  async function doBulkDelete() {
    if (busy) return;
    setBusy("delete");
    try { await onBulkDelete(Array.from(selected)); exitSelect(); }
    finally { setBusy(null); }
  }
  function requestRowDelete(id: string) {
    if (rowBusy) return;
    setPendingDeleteId(id);
    setConfirmTarget("single");
    setConfirmOpen(true);
  }
  async function doRowDelete(id: string) {
    if (rowBusy) return;
    setRowBusy(id);
    try { await onBulkDelete([id]); }
    finally { setRowBusy(null); }
  }
  async function doMarkRead() {
    if (busy) return;
    setBusy("read");
    try { await onMarkRead(Array.from(selected), true); exitSelect(); }
    finally { setBusy(null); }
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-col overflow-hidden bg-sidebar/40">
      {/* header */}
      {selectMode ? (
        <div className="flex h-16 shrink-0 items-center gap-2 overflow-hidden border-b px-3 sm:px-4">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={exitSelect} aria-label="取消">
            <X className="h-4 w-4" />
          </Button>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{selected.size} selected</span>
          <Button variant="ghost" size="icon" disabled={!selected.size || !!busy} onClick={doMarkRead} aria-label="标记已读">
            {busy === "read" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" disabled={!selected.size || !!busy} onClick={requestBulkDelete} aria-label="删除所选" className="text-muted-foreground hover:text-destructive">
            {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </div>
      ) : (
        <div className="shrink-0 overflow-hidden border-b p-4">
          <button onClick={onBack} className="mb-3 flex max-w-full items-center gap-1.5 self-start rounded-lg border px-2.5 py-1 text-muted-foreground hover:bg-accent">
            <ChevronLeft className="h-4 w-4" />
            <span className="text-xs font-bold uppercase">收件箱</span>
          </button>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs font-bold uppercase tracking-wider text-slate-500">邮件</span>
            <div className="flex shrink-0 items-center gap-1.5">
              {unread > 0 && (
                <span className="mr-1 rounded-full bg-primary px-1.5 text-xs font-semibold leading-4 text-primary-foreground">{unread}</span>
              )}
              <button disabled={!messages.length} onClick={() => setSelectMode(true)} aria-label="选择" className="rounded-lg border p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50">
                <CheckSquare className="h-3.5 w-3.5" />
              </button>
              <button onClick={onRefresh} aria-label="刷新" className="rounded-lg border p-1.5 text-muted-foreground transition-colors hover:bg-accent">
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              </button>
            </div>
          </div>
          <div className="mt-2 flex min-w-0 items-center justify-between overflow-hidden rounded-md border bg-secondary p-2.5">
            <span className="select-all truncate font-mono text-xs text-muted-foreground">{inbox.address}</span>
            <button onClick={() => { navigator.clipboard.writeText(inbox.address); toast.success("已复制"); }} className="ml-1.5 shrink-0 text-muted-foreground hover:text-foreground" aria-label="复制地址">
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* select-all bar */}
      {selectMode && messages.length > 0 && (
        <div role="button" tabIndex={0} onClick={toggleAll} className="flex cursor-pointer items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground hover:bg-accent/40">
          <Checkbox checked={allSelected} className="pointer-events-none" />
          {allSelected ? "Deselect all" : "Select all"}
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        {loading && messages.length === 0 ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
          </div>
        ) : messages.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-muted-foreground">
            <MailOpen className="mx-auto mb-2 h-8 w-8 opacity-40" />
            还没有邮件。
            <p className="mt-1 text-xs">往这个地址发封信，就会出现在这里。</p>
          </div>
        ) : (
          <div className="space-y-2.5 p-3">
            {messages.map((m, i) => {
              const isSel = selected.has(m.id);
              const isActive = activeMsg === m.id;
              return (
                <div
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => (selectMode ? toggle(m.id) : onSelect(m.id))}
                  style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                  className={cn(
                    "group/row relative grid w-full min-w-0 grid-cols-[minmax(0,1fr)] items-start overflow-hidden rounded-lg border bg-muted p-4 text-left transition-all animate-in fade-in slide-in-from-left-2 duration-300 fill-mode-both",
                    isSel ? "border-primary bg-primary/10" : isActive ? "border-border bg-accent" : "border-border/60 hover:border-border hover:bg-accent/60"
                  )}
                >
                  {selectMode ? (
                    <Checkbox checked={isSel} className="pointer-events-none mt-1 shrink-0" />
                  ) : null}
                  <div className={cn("min-w-0 overflow-hidden", !selectMode && "group-hover/row:pr-7")}>
                    {!selectMode && (
                      <div className="mb-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 overflow-hidden">
                        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 overflow-hidden">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-secondary text-xs font-bold">
                            {initials(m.from_name, m.from_addr)}
                          </div>
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <h4 className="truncate text-sm font-bold leading-tight">{m.from_name || m.from_addr || "未知"}</h4>
                            <p className="mt-0.5 truncate font-mono text-xs leading-none text-muted-foreground">{m.from_addr}</p>
                          </div>
                        </div>
                        <span className="max-w-16 truncate text-xs font-medium text-muted-foreground">{timeAgo(m.received_at)}</span>
                      </div>
                    )}
                    <h5 className={cn("mb-1 truncate text-sm font-bold tracking-tight", isActive ? "text-primary" : !m.seen ? "text-foreground" : "text-muted-foreground")}>
                      {m.subject || "(no subject)"}
                    </h5>
                    <p className="line-clamp-2 overflow-hidden break-all text-xs leading-relaxed text-muted-foreground">{m.preview}</p>
                  </div>
                  {!selectMode && isActive && <span className="absolute bottom-4 right-4 h-1.5 w-1.5 rounded-full bg-[#0066ff] shadow-md" />}
                  {!selectMode && !m.seen && !isActive && <span className="absolute bottom-4 right-4 h-1.5 w-1.5 rounded-full bg-primary" />}
                  {!selectMode && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="删除邮件"
                      onClick={(e) => { e.stopPropagation(); requestRowDelete(m.id); }}
                      className={cn(
                        "absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-background/80 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-destructive/10 hover:text-destructive",
                        "opacity-0 group-hover/row:opacity-100 focus:opacity-100",
                        rowBusy === m.id && "opacity-100"
                      )}
                    >
                      {rowBusy === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Delete confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {confirmTarget === "bulk" ? "删除所选邮件" : "删除邮件"}
            </DialogTitle>
            <DialogDescription>
              {confirmTarget === "bulk"
                ? `确定要永久删除选中的 ${selected.size} 封邮件吗？不可撤销。`
                : "确定要永久删除这封邮件吗？不可撤销。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>取消</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                if (confirmTarget === "bulk") {
                  doBulkDelete();
                } else if (pendingDeleteId) {
                  doRowDelete(pendingDeleteId);
                  setPendingDeleteId(null);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
