// HBA WhatsApp bot worker (whatsapp-web.js).
//
// Runs as a long-lived process on a 24/7 host (NOT Vercel — serverless can't
// keep a browser/socket alive). Drives a real WhatsApp account through
// WhatsApp Web and exposes a tiny authenticated HTTP API that the Next.js app
// calls from sendScorecard()/sendReminder().
//
// WARNING: whatsapp-web.js is UNOFFICIAL. Connecting a number automates it in
// violation of WhatsApp's ToS; Meta can ban that number permanently. Connect a
// DEDICATED prepaid SIM, never the academy's main number.

import express from "express";
import qrcode from "qrcode-terminal";
import QR from "qrcode";
import pkg from "whatsapp-web.js";

const { Client, LocalAuth } = pkg;

// Load .env from the worker directory (Node >=20.12) so config is picked up
// under pm2 / systemd, where the interactive shell's exported vars are NOT
// inherited. Harmless if there's no .env file (real env vars still win).
try {
  process.loadEnvFile();
} catch {
  /* no .env file present — fall back to the real environment */
}

// Keep the worker alive through transient Puppeteer / WhatsApp-Web hiccups (e.g.
// "Execution context was destroyed" during a page reload). Without this, Node
// exits on an unhandled rejection and pm2 thrashes restarting it. Real drops
// fire the client 'disconnected' event, which re-initializes.
process.on("unhandledRejection", (r) => console.error("unhandledRejection:", r?.message ?? r));
process.on("uncaughtException", (e) => console.error("uncaughtException:", e?.message ?? e));

const PORT = process.env.PORT || 8787;
const SECRET = process.env.WA_WORKER_SECRET || "";
const APP_URL = (process.env.APP_URL || "").replace(/\/$/, "");

if (!SECRET) {
  console.error(
    "FATAL: WA_WORKER_SECRET is not set. This shared secret authenticates the " +
      "website to this worker — set it (and the same value in the Next.js app).",
  );
  process.exit(1);
}

let ready = false;
let lastQr = null; // most recent unscanned QR string, served at /qr

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
  // Slow shared-CPU VMs (e2-micro) load WhatsApp Web too slowly for the default
  // auth timeout, which fires before 'ready' (logs show "auth timeout").
  // 0 = wait as long as the load needs.
  authTimeoutMs: 0,
  // Slow shared-CPU VMs make Chromium's CDP calls slow; the default protocol
  // timeout fires during init/inject ("Runtime.callFunctionOn timed out") and
  // the client never reaches ready. Give it generous headroom.
  puppeteer: {
    headless: true,
    protocolTimeout: 240000,
    // --no-sandbox: needed when running as root / on most Linux hosts.
    // --disable-dev-shm-usage: small cloud VMs (e.g. GCP e2-micro) have a tiny
    //   /dev/shm, which makes the WhatsApp Web tab crash with "Execution context
    //   was destroyed". This routes Chromium shared memory to /tmp instead.
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      // Trim background work / memory on small (1 GB) VMs.
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
    ],
    // On ARM/Raspberry Pi the bundled Chromium won't run — point at system
    // chromium via CHROME_PATH (see .env.example).
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  },
});

client.on("qr", (qr) => {
  ready = false;
  lastQr = qr; // expose to GET /qr so you can scan from a browser, no SSH
  console.log(
    "\n=== Scan this QR with the DEDICATED WhatsApp number ===\n" +
      "(WhatsApp → Settings → Linked Devices → Link a device)\n",
  );
  qrcode.generate(qr, { small: true });
  // Also write a scannable PNG — easier than the terminal QR on a headless /
  // SSH host (download qr.png and scan that). Contains a live link token.
  QR.toFile("qr.png", qr, { width: 512 }).catch((e) => console.error("qr.png write failed:", e.message));
});
client.on("authenticated", () =>
  console.log("Authenticated — session persisted in ./.wwebjs_auth (keep this folder private)."),
);
client.on("auth_failure", (m) => console.error("Auth failure:", m));
client.on("ready", () => {
  ready = true;
  lastQr = null; // linked — nothing to scan
  console.log("WhatsApp client READY. Worker can send messages.");
});
client.on("disconnected", (reason) => {
  ready = false;
  console.log("Disconnected:", reason, "— will try to re-init.");
  client.initialize().catch((e) => console.error("Re-init failed:", e));
});

// A launch/auth failure here must not kill the process — log it and keep the
// HTTP server up so /health stays reachable and reports not-ready.
client.initialize().catch((e) => console.error("Initialization failed:", e?.message || e));

const app = express();
app.use(express.json({ limit: "1mb" }));

// Bearer-secret auth on everything except the health probe. /qr is opened in a
// browser (can't set a Bearer header), so it accepts the secret as ?secret=… .
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (req.path === "/qr" && req.query.secret === SECRET) return next();
  if (req.get("authorization") !== `Bearer ${SECRET}`) {
    return res.status(401).json({ status: "failed", error: "unauthorized" });
  }
  next();
});

// Liveness + readiness. Returns { ready: true } only after the QR is scanned
// and the session is live.
app.get("/health", (_req, res) => res.json({ ready }));

// Browser QR for (re)linking the number — NO SSH. Open
//   http://<host>:<PORT>/qr?secret=YOUR_WA_WORKER_SECRET
// on a laptop/second screen, then scan with the dedicated phone
// (WhatsApp → Settings → Linked devices → Link a device). Page self-refreshes.
app.get("/qr", async (_req, res) => {
  res.set("content-type", "text/html; charset=utf-8");
  res.set("cache-control", "no-store");
  const shell = (inner, refresh) =>
    `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">` +
    (refresh ? `<meta http-equiv=refresh content="${refresh}">` : "") +
    `<body style="font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:28px;color:#0f172a">${inner}</body>`;

  if (ready) return res.send(shell(`<h2>✅ Already linked</h2><p>The worker is connected — no QR needed.</p>`));
  if (!lastQr) return res.send(shell(`<h2>Booting…</h2><p>Waiting for a QR. This page refreshes every 5s.</p>`, 5));
  try {
    const dataUrl = await QR.toDataURL(lastQr, { width: 320, margin: 2 });
    return res.send(
      shell(
        `<h2>Scan to link WhatsApp</h2>` +
          `<p>Phone → WhatsApp → Settings → Linked devices → <b>Link a device</b></p>` +
          `<img src="${dataUrl}" width="320" height="320" alt="WhatsApp QR code"/>` +
          `<p style="color:#64748b;font-size:13px">QR rotates often — this page auto-refreshes every 20s.</p>`,
        20,
      ),
    );
  } catch (e) {
    return res.status(500).send(shell(`<h2>QR render failed</h2><p>${String(e?.message || e)}</p>`));
  }
});

// Resolve a number + send, retrying transient Puppeteer errors (the WhatsApp
// Web page can reload mid-call on low-RAM hosts -> "Execution context was
// destroyed"). Shared by the /send route and the drip sender.
async function sendWithRetry(to, text) {
  const raw = String(to);
  // A serialized chat id (group "…@g.us" / contact "…@c.us") is sent as-is — no
  // number lookup. Plain phone numbers are resolved to a WhatsApp contact first.
  const isChatId = raw.includes("@");
  const digits = raw.replace(/[^\d]/g, "");
  if (!isChatId && !digits) return { error: "invalid number" };
  const transient = /Execution context was destroyed|Protocol error|Target closed|Session closed/i;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      let chatId = raw;
      if (!isChatId) {
        const numberId = await client.getNumberId(digits);
        if (!numberId) return { notOnWhatsapp: true };
        chatId = numberId._serialized;
      }
      const msg = await client.sendMessage(chatId, String(text));
      return { providerMessageId: msg?.id?._serialized };
    } catch (e) {
      lastErr = e;
      if (transient.test(String(e?.message || e)) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// Send a free-form text message. Body: { to: "+60123456789", text: "hi" }.
app.post("/send", async (req, res) => {
  if (!ready) {
    return res
      .status(503)
      .json({ status: "failed", error: "client not ready (scan QR / still booting)" });
  }
  const { to, text } = req.body || {};
  if (!to || !text) {
    return res.status(400).json({ status: "failed", error: "missing 'to' or 'text'" });
  }
  try {
    const r = await sendWithRetry(to, text);
    if (r.error) return res.status(400).json({ status: "failed", error: r.error });
    if (r.notOnWhatsapp) return res.status(422).json({ status: "failed", error: "number not on WhatsApp" });
    return res.json({ status: "sent", providerMessageId: r.providerMessageId });
  } catch (e) {
    return res.status(500).json({ status: "failed", error: String(e?.message || e) });
  }
});

// List the groups/communities this number belongs to, so you can grab the
// Community Announcements group's chat id for WA_COMMUNITY_GROUP_ID. The number
// must already be a member (and an admin, to post to an announcements group).
app.get("/groups", async (_req, res) => {
  if (!ready) {
    return res.status(503).json({ status: "failed", error: "client not ready (scan QR / still booting)" });
  }
  try {
    const chats = await client.getChats();
    const groups = chats
      .filter((c) => c.isGroup)
      .map((c) => ({
        id: c.id?._serialized,
        name: c.name,
        // announce=true → admins-only "Announcements" group (what we want for a
        // Community notice). parent set → it's a subgroup of a Community.
        announce: c.groupMetadata?.announce ?? null,
        parent: c.groupMetadata?.parentGroup?._serialized ?? null,
        size: c.participants?.length ?? null,
      }));
    return res.json({ groups });
  } catch (e) {
    return res.status(500).json({ status: "failed", error: String(e?.message || e) });
  }
});

app.listen(PORT, () => console.log(`WA worker listening on :${PORT}`));

// --- Throttled drip sender (very cautious) -----------------------------------
// Polls the app for the next queued reminder on a long, jittered interval. The
// APP enforces the real policy (daytime window, daily cap, min-gap, random
// skips) — this loop just asks and obeys. Enabled only when APP_URL is set.
async function reportResult(id, status, providerMessageId, error) {
  try {
    await fetch(`${APP_URL}/api/worker/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ id, status, providerMessageId, error }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    console.error("drip: report failed:", e?.message || e);
  }
}

async function dripTick() {
  try {
    if (ready && APP_URL) {
      const res = await fetch(`${APP_URL}/api/worker/next`, {
        headers: { Authorization: `Bearer ${SECRET}` },
        signal: AbortSignal.timeout(15000),
      });
      const j = await res.json().catch(() => ({}));
      const m = j && j.message;
      if (m && m.id) {
        try {
          const r = await sendWithRetry(m.to, m.text);
          if (r.notOnWhatsapp) await reportResult(m.id, "failed", undefined, "number not on WhatsApp");
          else if (r.error) await reportResult(m.id, "failed", undefined, r.error);
          else {
            await reportResult(m.id, "sent", r.providerMessageId);
            console.log("drip: sent reminder", m.id);
          }
        } catch (e) {
          await reportResult(m.id, "failed", undefined, String(e?.message || e));
        }
      }
    }
  } catch (e) {
    console.error("drip: tick error:", e?.message || e);
  } finally {
    // Long, irregular gap (8-15 min) between polls; the app gates the rest.
    setTimeout(dripTick, (8 + Math.random() * 7) * 60 * 1000);
  }
}

if (APP_URL) {
  console.log("Drip sender ON — polling", APP_URL);
  setTimeout(dripTick, 60 * 1000); // first poll a minute after boot
} else {
  console.log("Drip sender OFF (set APP_URL in .env to enable auto-reminders).");
}
