# HBA WhatsApp bot worker (whatsapp-web.js)

Always-on service that drives a **real WhatsApp account** through WhatsApp Web and
exposes a tiny HTTP API the HBA website calls to auto-send score cards & fee
reminders.

```
[Next.js on Vercel]  --HTTPS + bearer secret-->  [this worker (24/7 host)]  -->  WhatsApp Web
```

## ⚠️ Read first — ban risk

`whatsapp-web.js` is **unofficial**. Automating a WhatsApp number this way breaks
WhatsApp's Terms of Service. **Meta can ban the connected number permanently, at
any time.** Mitigations:

- Connect a **dedicated prepaid SIM**, never the academy's main number.
- Don't blast: the existing send buttons are per-parent and human-triggered.
- **For anything everyone should see** (schedule changes, closures, events) use
  the app's **Announcements** page — you post once, by hand, into a WhatsApp
  Community. That needs no worker at all (see the app, not this service).
- Keep `.wwebjs_auth/` private — it is the logged-in session.

The official, ban-free path is Meta Cloud API (needs an SSM business + Meta
verification). That provider is still wired in the app and takes over
automatically if you set the `WHATSAPP_*` env vars instead of the worker ones.

## Run it (24/7 host)

The worker is plain Node — it runs on any always-on host. Best **free, never-sleeps**
option is a cloud VM:

**Oracle Cloud — Always Free** (free forever, not a 12-month trial). Create an
**Ampere A1 (ARM)** instance with ~1–2 OCPU / 6 GB RAM (well inside the free
quota and enough for Chromium — the 1 GB AMD micro will OOM). Use an Ubuntu
image, SSH in, then run the steps below. The QR prints as ASCII **in your SSH
terminal** — scan it with the phone. On ARM you must use system chromium via
`CHROME_PATH` (see "Chrome / Chromium binary" below). Don't open port 8787 to the
world — reach it via the tunnel below.

Alternatives: an **on-site PC / Raspberry Pi** (free if it already runs 24/7), or
any small VPS. **Avoid** free tiers that sleep (Render free, Railway trial) — they
drop the WhatsApp session.

```bash
cd wa-worker
cp .env.example .env          # then edit WA_WORKER_SECRET
npm install                   # installs deps — does NOT bundle a browser
# provide Chrome/Chromium first — see "Chrome / Chromium binary" below
npm start
```

First run prints a QR in the terminal. On the **dedicated** phone:
WhatsApp → Settings → **Linked Devices** → **Link a device** → scan it.
After "WhatsApp client READY", the session persists in `.wwebjs_auth/` — no
re-scan on restart.

Keep it running: `pm2 start server.mjs --name hba-wa` (install pm2 globally), or
a systemd unit / Windows Task Scheduler "at startup".

### Chrome / Chromium binary

whatsapp-web.js bundles `puppeteer-core`, which does **not** download a browser on
`npm install`. Provide one:

```bash
# A) System chromium + CHROME_PATH — works on x64 AND ARM (use this on Oracle ARM):
sudo apt install -y chromium-browser                   # or: sudo snap install chromium
echo 'CHROME_PATH=/usr/bin/chromium-browser' >> .env   # snap path: /snap/bin/chromium

# B) Or let puppeteer fetch its own build (x64 / mac only — NOT ARM):
npx puppeteer browsers install chrome
```

If startup logs `Could not find Chrome (ver. …)`, the browser step was skipped or
`CHROME_PATH` points at the wrong place. (Verified locally on Windows x64 via
option B — server, bearer auth, and QR all came up clean.)

## Make it reachable from Vercel

Vercel runs in the cloud, so the worker needs a public **HTTPS** URL: Vercel can't
reach a `localhost`/LAN address (on-site box), and a raw cloud-VM IP is plaintext
over an open port. Easiest free option either way is a **Cloudflare Tunnel**
(stable URL, no open ports, free TLS):

```bash
cloudflared tunnel --url http://localhost:8787
```

It prints a `https://<random>.trycloudflare.com` URL (for a permanent URL, set up
a named tunnel on your domain). Then in **Vercel → Project → Settings → Env**:

```
WA_WORKER_URL    = https://<your-tunnel>.trycloudflare.com
WA_WORKER_SECRET = <same secret as wa-worker/.env>
```

Redeploy. From then on the website's "Send" actions auto-send through this
worker. Unset those two vars to fall back to the Meta stub / wa.me click flow.

## API

| Method | Path      | Auth                       | Body                         | Returns                                            |
|--------|-----------|----------------------------|------------------------------|----------------------------------------------------|
| GET    | `/health` | none                       | —                            | `{ ready: boolean }`                               |
| POST   | `/send`   | `Authorization: Bearer …`  | `{ to: "+60…", text: "…" }`  | `{ status: "sent", providerMessageId }` or `failed`|

Quick test once READY:

```bash
curl -X POST http://localhost:8787/send \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"to":"+60123456789","text":"HBA worker test"}'
```

> **Community announcements need no worker.** Posting one notice that every
> parent sees is done by hand in a WhatsApp Community — the app's
> **Admin → Announcements** page composes the text and you paste it into the
> community's Announcements group yourself. This service is only for the
> per-parent DM sends above.
