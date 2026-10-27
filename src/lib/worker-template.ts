// The Email Worker source that gets uploaded to Cloudflare.
// Runs on inbound email for any address routed to it (one Email Routing rule
// per inbox, created on inbox creation). Parses with a tiny inline MIME parser
// (no dependencies, so the single-file module upload works) and INSERTs a row
// into the D1 `messages` table.
//
// D1 binding name: DB
//
// We keep parsing minimal & dependency-free so the single-file module upload works.

export const EMAIL_WORKER_SOURCE = String.raw`
// Charset-aware byte decoding.
// The naive path (atob -> JS string) yields a latin1 view of the bytes, which
// silently mangles every non-ASCII body — a GBK-encoded Chinese mail shows up as
// mojibake. So: produce bytes first, then decode with the charset the MIME part
// actually declares. TextDecoder knows gbk / gb18030 / big5 natively.
function charsetOf(contentType) {
  const m = /charset\s*=\s*"?([\w.:-]+)"?/i.exec(contentType || "");
  if (!m) return "utf-8";
  const cs = m[1].toLowerCase().trim();
  // Common aliases the WHATWG spec folds together; TextDecoder handles them,
  // but normalise a couple of odd ones we have seen in the wild.
  if (cs === "utf8") return "utf-8";
  if (cs === "gb2312" || cs === "gbk" || cs === "x-gbk") return "gb18030";
  return cs;
}
function decodeBytes(bytes, charset) {
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch (e) {
    // Unknown label -> fall back to UTF-8, then to a latin1-ish best effort.
    try { return new TextDecoder("utf-8", { fatal: false }).decode(bytes); }
    catch (e2) { return String.fromCharCode.apply(null, bytes); }
  }
}
function base64ToBytes(str) {
  const clean = str.replace(/\s/g, "");
  try {
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch (e) { return null; }
}
function binaryToBytes(str) {
  // The raw mail is a latin1 view: one char per byte.
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}
function qpToBytes(str) {
  // Soft line breaks first, then =XX escapes. Everything else is a literal byte.
  const s = str.replace(/=\r?\n/g, "");
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) {
      out.push(parseInt(s.substr(i + 1, 2), 16));
      i += 2;
    } else {
      out.push(c.charCodeAt(0) & 0xff);
    }
  }
  return new Uint8Array(out);
}
function decodeMimeBody(rawText, encoding, charset) {
  const enc = (encoding || "").toLowerCase();
  if (enc.indexOf("base64") > -1) {
    const bytes = base64ToBytes(rawText);
    if (bytes) return decodeBytes(bytes, charset);
  } else if (enc.indexOf("quoted-printable") > -1) {
    return decodeBytes(qpToBytes(rawText), charset);
  }
  // 7bit / 8bit / no encoding: rawText is still the latin1 byte view, so the
  // bytes are intact. Decode with whatever charset the part declares.
  return decodeBytes(binaryToBytes(rawText), charset);
}
// RFC 2047 encoded-words in headers. Same charset problem as bodies.
function decodeRFC2047(s) {
  if (!s) return s;
  return s.replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (_, cs, enc, txt) => {
    const charset = charsetOf("charset=" + cs);
    try {
      if (enc.toUpperCase() === "B") {
        const bytes = base64ToBytes(txt);
        return bytes ? decodeBytes(bytes, charset) : txt;
      }
      const bytes = qpToBytes(txt.replace(/_/g, " "));
      return decodeBytes(bytes, charset);
    } catch (e) { return txt; }
  });
}
function parseHeaders(block) {
  const headers = {};
  const lines = block.split(/\r?\n/);
  let cur = "";
  for (const line of lines) {
    if (/^\s/.test(line) && cur) {
      headers[cur] += " " + line.trim();
    } else {
      const idx = line.indexOf(":");
      if (idx > -1) {
        cur = line.slice(0, idx).toLowerCase();
        headers[cur] = line.slice(idx + 1).trim();
      }
    }
  }
  // Header values are a latin1 view of raw bytes. RFC 2047 encoded-words are
  // pure ASCII so they pass through untouched; the rare unencoded UTF-8 header
  // is repaired here by re-reading its bytes as UTF-8.
  for (const k in headers) {
    const v = headers[k];
    if (/[\x80-\xff]/.test(v)) {
      try { headers[k] = new TextDecoder("utf-8", { fatal: true }).decode(binaryToBytes(v)); }
      catch (e) { /* keep the latin1 view */ }
    }
  }
  return headers;
}
function parseEmail(raw) {
  const sep = raw.indexOf("\r\n\r\n") > -1 ? "\r\n\r\n" : "\n\n";
  const splitAt = raw.indexOf(sep);
  const headerBlock = splitAt > -1 ? raw.slice(0, splitAt) : raw;
  let body = splitAt > -1 ? raw.slice(splitAt + sep.length) : "";
  const headers = parseHeaders(headerBlock);
  const ctype = headers["content-type"] || "";
  let text = "", html = "";
  const boundaryMatch = ctype.match(/boundary="?([^";]+)"?/i);
  const attachments = [];
  if (boundaryMatch) {
    const boundary = "--" + boundaryMatch[1];
    const parts = body.split(boundary);
    for (const part of parts) {
      const pSplit = part.indexOf("\r\n\r\n") > -1 ? "\r\n\r\n" : "\n\n";
      const pAt = part.indexOf(pSplit);
      if (pAt < 0) continue;
      const ph = parseHeaders(part.slice(0, pAt));
      let pbody = part.slice(pAt + pSplit.length);
      const rawBody = pbody;
      const enc = ph["content-transfer-encoding"] || "";
      const pct = ph["content-type"] || "";
      pbody = decodeMimeBody(pbody, enc, charsetOf(pct));
      const disp = ph["content-disposition"] || "";
      if (pct.includes("text/plain") && !disp.includes("attachment")) { text += pbody; }
      else if (pct.includes("text/html") && !disp.includes("attachment")) { html += pbody; }
      else if (disp.includes("attachment") || disp.includes("inline") && !pct.includes("text/")) {
        const fnMatch = disp.match(/filename="?([^"\n;]+)"?/i) || pct.match(/name="?([^"\n;]+)"?/i);
        const ct = pct.split(";")[0].trim() || "application/octet-stream";
        attachments.push({ filename: fnMatch ? fnMatch[1].trim() : null, contentType: ct, raw: rawBody, isBase64: (enc || "").toLowerCase().indexOf("base64") > -1, size: pbody.length });
      }
    }
  } else {
    body = decodeMimeBody(body, headers["content-transfer-encoding"] || "", charsetOf(ctype));
    if (ctype.includes("text/html")) html = body; else text = body;
  }
  let fromName = "", fromAddr = "";
  const fromRaw = decodeRFC2047(headers["from"] || "");
  const m = fromRaw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/) || fromRaw.match(/(\S+@\S+)/);
  if (m) { if (m[2]) { fromName = m[1].trim(); fromAddr = m[2].trim(); } else { fromAddr = m[1].trim(); } }
  return { fromName, fromAddr, subject: decodeRFC2047(headers["subject"] || ""), text: text.trim(), html: html.trim(), attachments };
}

export default {
  async email(message, env) {
    const to = (message.to || "").toLowerCase();
    let raw = "";
    try {
      const reader = message.raw.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const merged = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
      let off = 0; for (const c of chunks) { merged.set(c, off); off += c.length; }
      // Keep the raw mail as a *binary string* (one char per byte, latin1 view).
      // Decoding as UTF-8 here would destroy every GBK/Big5 byte before the
      // per-part charset step ever runs — that is what produced mojibake bodies.
      const CHUNK = 8192;
      const parts = [];
      for (let i = 0; i < merged.length; i += CHUNK) {
        parts.push(String.fromCharCode.apply(null, merged.subarray(i, i + CHUNK)));
      }
      raw = parts.join("");
    } catch (e) { raw = ""; }

    const parsed = parseEmail(raw);
    const ts = Date.now();
    const id = crypto.randomUUID();
    const from = parsed.fromAddr || message.from || "";
    const preview = (parsed.text || (parsed.html || "").replace(/<[^>]+>/g, " ") || "")
      .replace(/\s+/g, " ").trim().slice(0, 140);

    try {
      await env.DB.prepare(
        "INSERT INTO messages (id, address, from_addr, from_name, subject, text, html, preview, size, seen, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)"
      ).bind(
        id, to, from, parsed.fromName || "", parsed.subject || "",
        parsed.text || "", parsed.html || "", preview, raw.length, ts
      ).run();
      // bump the inbox's last_message_at (no-op if the address isn't registered)
      await env.DB.prepare("UPDATE inboxes SET last_message_at = ? WHERE address = ?")
        .bind(ts, to).run();

      // Store attachments in R2 if the binding exists (optional — needs CC on CF)
      if (env.ATTACHMENTS && parsed.attachments.length > 0) {
        for (let i = 0; i < parsed.attachments.length; i++) {
          const att = parsed.attachments[i];
          const attId = crypto.randomUUID();
          // finding 2: the R2 key is <messageId>/<attachmentId> — random UUIDs
          // only. The sender-controlled filename never becomes part of the
          // storage key; it is preserved raw as D1 metadata (finding 5).
          const r2Key = id + "/" + attId;
          try {
            // Convert base64 string to bytes for R2
            let bytes;
            if (att.isBase64) {
              const bstr = atob(att.raw.replace(/\s/g, ""));
              bytes = new Uint8Array(bstr.length);
              for (let j = 0; j < bstr.length; j++) bytes[j] = bstr.charCodeAt(j);
            } else {
              bytes = new TextEncoder().encode(att.raw);
            }
            await env.ATTACHMENTS.put(r2Key, bytes, {
              httpMetadata: { contentType: att.contentType },
            });
            await env.DB.prepare(
              "INSERT INTO attachments (id, message_id, filename, content_type, size, r2_key) VALUES (?, ?, ?, ?, ?, ?)"
            ).bind(attId, id, att.filename || null, att.contentType, bytes.length, r2Key).run();
          } catch (e) { /* best-effort: skip failed attachment */ }
        }
      }
    } catch (e) { /* swallow: never bounce mail on a storage hiccup */ }
  },

  // Retention sweep. Runs on a Cloudflare Cron Trigger (installed by the app).
  // Reads retention_seconds from D1 settings; 0/absent means "keep forever".
  async scheduled(event, env, ctx) {
    let secs = 0;
    try {
      const row = await env.DB.prepare(
        "SELECT value FROM settings WHERE key = 'retention_seconds'"
      ).first();
      secs = row && Number(row.value) || 0;
    } catch (e) { return; }
    if (!secs || secs <= 0) return;
    const cutoff = Date.now() - secs * 1000;
    try {
      await env.DB.prepare("DELETE FROM messages WHERE received_at < ?").bind(cutoff).run();
      await env.DB.prepare(
        "DELETE FROM attachments WHERE message_id NOT IN (SELECT id FROM messages)"
      ).run();
      // Drop auto-created inboxes that have gone quiet, so the list doesn't grow forever.
      // Discriminator is route_id, NOT label: label is free text the user can type
      // anything into, while every inbox created through the app gets an explicit
      // Email Routing rule and therefore a non-null route_id. Rows written by the
      // auto_inbox_on_message trigger always leave route_id NULL.
      await env.DB.prepare(
        "DELETE FROM inboxes WHERE route_id IS NULL AND (last_message_at IS NULL OR last_message_at < ?)"
      ).bind(cutoff).run();
    } catch (e) { /* best-effort */ }
  },
};
`;
