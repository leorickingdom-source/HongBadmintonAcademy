// Cloudflare quick-tunnel manager + URL self-registration.
//
// Starts a cloudflare quick tunnel to the local worker, reads the assigned
// https://<random>.trycloudflare.com URL, and POSTs it to the app's
// /api/worker/register-url (authenticated with WA_WORKER_SECRET). The app stores
// it, so the ephemeral URL that changes on every restart never needs a Vercel
// edit. Restarts the tunnel if it dies (new URL -> re-register) and re-asserts
// the URL every few minutes in case the app's stored value was cleared.
//
// Run alongside server.mjs (see run-worker-autostart.bat).

import { spawn } from "node:child_process";

try {
  process.loadEnvFile();
} catch {
  /* no .env — rely on real env */
}

const SECRET = process.env.WA_WORKER_SECRET || "";
const PORT = process.env.PORT || 8787;
// Where to register the URL — the STABLE app URL (never changes).
const APP_URL = (process.env.APP_URL || "https://hong-badminton-academy.vercel.app").replace(/\/$/, "");
// Path to cloudflared. Defaults to cloudflared.exe next to the worker (where
// setup-client.bat downloads it); override with CLOUDFLARED_PATH.
const CLOUDFLARED = process.env.CLOUDFLARED_PATH || "cloudflared.exe";

if (!SECRET) {
  console.error("FATAL: WA_WORKER_SECRET not set — can't authenticate URL registration.");
  process.exit(1);
}

let currentUrl = null;

async function register(url) {
  try {
    const r = await fetch(`${APP_URL}/api/worker/register-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(15000),
    });
    console.log(`[tunnel] registered ${url} -> ${APP_URL} (HTTP ${r.status})`);
  } catch (e) {
    console.error("[tunnel] register failed:", e?.message || e);
  }
}

function start() {
  console.log("[tunnel] starting cloudflared ->", `http://localhost:${PORT}`);
  const cf = spawn(CLOUDFLARED, ["tunnel", "--url", `http://localhost:${PORT}`], {
    windowsHide: true,
  });

  const scan = (buf) => {
    const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && m[0] !== currentUrl) {
      currentUrl = m[0];
      console.log("[tunnel] URL:", currentUrl);
      register(currentUrl);
    }
  };
  cf.stdout.on("data", scan);
  cf.stderr.on("data", scan); // cloudflared prints the URL to stderr

  cf.on("exit", (code) => {
    console.error(`[tunnel] cloudflared exited (${code}) — restarting in 3s`);
    currentUrl = null;
    setTimeout(start, 3000);
  });
}

start();

// Re-assert the URL periodically (covers app redeploys / cleared settings).
setInterval(() => {
  if (currentUrl) register(currentUrl);
}, 5 * 60 * 1000);
