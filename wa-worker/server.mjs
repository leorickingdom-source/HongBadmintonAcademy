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

if (!SECRET) {
  console.error(
    "FATAL: WA_WORKER_SECRET is not set. This shared secret authenticates the " +
      "website to this worker — set it (and the same value in the Next.js app).",
  );
  process.exit(1);
}

let ready = false;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
  puppeteer: {
    headless: true,
    // --no-sandbox: needed when running as root / on most Linux hosts.
    // --disable-dev-shm-usage: small cloud VMs (e.g. GCP e2-micro) have a tiny
    //   /dev/shm, which makes the WhatsApp Web tab crash with "Execution context
    //   was destroyed". This routes Chromium shared memory to /tmp instead.
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
    // On ARM/Raspberry Pi the bundled Chromium won't run — point at system
    // chromium via CHROME_PATH (see .env.example).
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  },
});

client.on("qr", (qr) => {
  ready = false;
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

// Bearer-secret auth on everything except the health probe.
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (req.get("authorization") !== `Bearer ${SECRET}`) {
    return res.status(401).json({ status: "failed", error: "unauthorized" });
  }
  next();
});

// Liveness + readiness. Returns { ready: true } only after the QR is scanned
// and the session is live.
app.get("/health", (_req, res) => res.json({ ready }));

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
    const digits = String(to).replace(/[^\d]/g, "");
    if (!digits) return res.status(400).json({ status: "failed", error: "invalid number" });

    // Resolve to a real WhatsApp chat id — also tells us if the number isn't on
    // WhatsApp instead of silently dropping the message.
    const numberId = await client.getNumberId(digits);
    if (!numberId) {
      return res.status(422).json({ status: "failed", error: "number not on WhatsApp" });
    }

    const msg = await client.sendMessage(numberId._serialized, String(text));
    res.json({ status: "sent", providerMessageId: msg?.id?._serialized });
  } catch (e) {
    res.status(500).json({ status: "failed", error: String(e?.message || e) });
  }
});

app.listen(PORT, () => console.log(`WA worker listening on :${PORT}`));
