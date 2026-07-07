# HBA WhatsApp Worker — Client Box Setup

Run the always-on WhatsApp worker on a Windows box (the academy's machine).
Self-contained: one script installs everything and it survives reboots with no
one touching it. No Vercel edits ever — the worker registers its own URL.

## What you need
- A Windows box that stays powered on
- The dedicated WhatsApp SIM (phone) for linking — **never the main number**
- The `WA_WORKER_SECRET` value (same one set in Vercel) — ask whoever set up Vercel

## Setup — 4 steps
1. **Copy** the `wa-worker` folder onto the box (or `git clone` the repo).
2. **Double-click `setup-client.bat`**. It downloads Node + cloudflared, installs
   deps, registers autostart, and starts the worker. When it asks, **paste the
   `WA_WORKER_SECRET`**.
3. **Scan the QR** that pops open in your browser, with the dedicated SIM
   (WhatsApp → Linked devices → Link a device). Wait until it says connected.
4. **(Optional, for unattended reboots)** enable auto-login:
   `Win+R` → `netplwiz` → Enter → uncheck *"Users must enter a user name and
   password"* → Apply → type the Windows password.

That's it. From now on:
- Reboot → auto-login → worker + tunnel auto-start → re-links from the saved
  session → registers its URL → live. No admin, no re-scan, no Vercel edits.

## Keep it running
- Don't let the box **sleep** (Settings → Power → Sleep = Never).
- Leave it on. That's the only rule.

## Handing the worker to a new person / swapping the number
Admin → **Settings → Link WhatsApp → Disconnect & re-link** → scan the new SIM.
All in the web app, no access to the box needed.

## If a send fails
1. Admin → Settings → Link WhatsApp — is it green?
2. Not green → on the box, re-run `run.bat` (or just reboot). It re-links itself.
3. Every failure is logged in the app's WhatsApp Log with the exact error.

## Files
- `setup-client.bat` — one-time installer (run once)
- `run.bat` — what autostart launches (worker + tunnel loops); safe to run manually
- `run-tunnel.bat`, `tunnel.mjs` — cloudflare tunnel + URL self-registration
- `server.mjs` — the worker
- `.env` — holds `WA_WORKER_SECRET` (created by setup; never commit)
