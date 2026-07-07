# HBA WhatsApp Worker — Windows Laptop Deploy (NSSM service)

Runs the worker as an always-on **Windows service**: starts at boot, before login,
auto-restarts on crash, no window needed. Replaces the old GCP e2-micro + pm2 setup.

## Prereqs on the laptop
- **Node 20+ LTS** — https://nodejs.org (verify: `node --version`)
- **Repo/worker code** — `git clone` the repo, or copy the `wa-worker` folder
  (skip `node_modules`, `.wwebjs_auth` — they're rebuilt/re-linked on the laptop)
- **Dedicated SIM** phone for linking (never the academy's main number)

## 1. Config
Copy `.env.example` → `.env` in `wa-worker\`, then set:
```
WA_WORKER_SECRET=<SAME value as Vercel's WA_WORKER_SECRET>
PORT=8787
APP_URL=https://hong-badminton-academy.vercel.app
```
(No `CHROME_PATH` on Windows — bundled Chromium is used.)

## 2. Install deps + first link (do this BEFORE the service)
```powershell
cd C:\path\to\wa-worker
npm install
node server.mjs
```
Open `http://localhost:8787/qr?secret=<SECRET>` → scan with the dedicated SIM
(WhatsApp → Linked devices → Link a device). Wait for `WhatsApp client READY`.
Ctrl+C. The session is now saved in `.wwebjs_auth\` — the service will reuse it.

## 3. Install NSSM
- Download from https://nssm.cc/download → unzip → use `win64\nssm.exe`
- Put it somewhere stable, e.g. `C:\nssm\nssm.exe`
- Find Node's path: `where node`  (usually `C:\Program Files\nodejs\node.exe`)

## 4. Create the service
```powershell
# adjust paths to match the laptop
C:\nssm\nssm.exe install hba-wa "C:\Program Files\nodejs\node.exe" "server.mjs"
C:\nssm\nssm.exe set hba-wa AppDirectory "C:\path\to\wa-worker"

# capture logs (service has no console — this is how you see QR text + errors)
mkdir "C:\path\to\wa-worker\logs" 2>$null
C:\nssm\nssm.exe set hba-wa AppStdout "C:\path\to\wa-worker\logs\out.log"
C:\nssm\nssm.exe set hba-wa AppStderr "C:\path\to\wa-worker\logs\err.log"

# start at boot, auto-restart on crash (both are NSSM defaults, set explicitly)
C:\nssm\nssm.exe set hba-wa Start SERVICE_AUTO_START
C:\nssm\nssm.exe set hba-wa AppExit Default Restart

C:\nssm\nssm.exe start hba-wa
```
`.env` is read automatically — the worker calls `process.loadEnvFile()` from
`AppDirectory`, so you do NOT need to set env vars inside NSSM.

## 5. Verify
```powershell
C:\nssm\nssm.exe status hba-wa       # -> SERVICE_RUNNING
curl http://localhost:8787/health    # -> {"ready":true} after ~1-2 min
```

## 6. Public URL (so Vercel can reach the laptop)
```powershell
# install Tailscale, sign in (same account as before), then:
tailscale funnel 8787
```
Copy the `https://<laptop>.tailXXXX.ts.net` URL → set Vercel env
`WA_WORKER_URL` to it (`WA_WORKER_SECRET` stays the same) → redeploy.

## 7. Disable sleep (critical)
Settings → System → Power:
- Screen off / Sleep = **Never** (plugged in)
- Control Panel → Power Options → **lid close = Do nothing**
A sleeping laptop = dead worker.

---

## Managing the service
```powershell
C:\nssm\nssm.exe status  hba-wa      # running?
C:\nssm\nssm.exe restart hba-wa      # restart
C:\nssm\nssm.exe stop    hba-wa      # stop
C:\nssm\nssm.exe edit    hba-wa      # GUI to change paths/settings
C:\nssm\nssm.exe remove  hba-wa confirm   # uninstall service
```
Logs: `wa-worker\logs\out.log` (QR text, READY, sends) and `err.log`.

## Re-link the number (lost session / new phone)
```powershell
C:\nssm\nssm.exe stop hba-wa
# wipe old session:
rmdir /s /q .wwebjs_auth
rmdir /s /q .wwebjs_cache
C:\nssm\nssm.exe start hba-wa
```
Open `http://localhost:8787/qr?secret=<SECRET>` → scan → wait for READY in `logs\out.log`.
(Or use the in-app: Admin → Settings → Link WhatsApp — no local access needed.)

## If the number gets BANNED (cold-swap)
1. New SIM → phone → install WhatsApp → register (OTP).
2. Re-link (steps above) with the new number.
3. Nothing else changes — same service, same Tailscale URL, same Vercel env.

## Golden rules (stay unbanned)
- Unofficial bot — Meta can ban anytime. Never mass-blast.
- Dedicated SIM only, never the academy's main number.
- Keep the phone powered + occasionally online so the linked device stays alive.
