import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCfConfig, setWorkerCrons, WORKER_NAME } from "@/lib/cloudflare";
import { getSetting, setSetting } from "@/lib/d1";

// Mail retention policy.
//
// The email worker exposes a `scheduled` handler that deletes messages older
// than `retention_seconds` and drops auto-created inboxes that have gone quiet.
// Cloudflare cron granularity is one minute, so any value >= 60s is honoured
// within about a minute of accuracy; 0 (or "off") keeps mail forever.

const MIN_SECONDS = 60;
const MAX_SECONDS = 366 * 24 * 60 * 60; // one year
const CRON = "*/1 * * * *";

function normalize(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return 0;
  return Math.min(Math.max(Math.round(n), MIN_SECONDS), MAX_SECONDS);
}

async function currentSeconds(): Promise<number> {
  const raw = await getSetting("retention_seconds");
  const n = Number(raw ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Make sure the worker actually has the cron installed. Without it the
// scheduled handler never runs, so a saved policy would silently do nothing.
async function ensureCron(): Promise<string | null> {
  const cfg = await getCfConfig();
  if (!cfg) return "Cloudflare not configured";
  const workerName = (await getSetting("worker_name")) || WORKER_NAME;
  try {
    await setWorkerCrons(cfg, workerName, [CRON]);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ seconds: await currentSeconds(), minSeconds: MIN_SECONDS });
}

export async function PUT(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const seconds = normalize(body?.seconds);
  if (seconds === null) {
    return NextResponse.json({ error: "seconds must be a number (0 disables cleanup)" }, { status: 400 });
  }

  await setSetting("retention_seconds", String(seconds));

  let warning: string | null = null;
  if (seconds > 0) warning = await ensureCron();

  return NextResponse.json({ ok: true, seconds, cronWarning: warning });
}
