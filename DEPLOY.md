# Deploying the portal

## Zero-cost, from anywhere — the short version

You own **coderfact.com and it is already on Cloudflare**, which makes the free
path genuinely good rather than a compromise:

```powershell
.\scripts\go-online.ps1        # once — password, tunnel, boot-start
.\scripts\factory-online.cmd   # starts portal + tunnel + worker together
```

Then open **https://factory.coderfact.com** from any device.

| | Cost |
|---|---|
| Cloudflare Tunnel | **₹0** — no bandwidth or request charges |
| Stable subdomain + HTTPS | **₹0** — you already pay for the domain |
| Cloudflare Access (second gate) | **₹0** up to 50 users |
| Compute | **₹0** — it is your own PC |
| AI | **₹0** — the free tier already runs everything |

Nothing here has a trial that expires.

### The one honest catch

**The tunnel only answers while your PC is awake.** That is the real cost of
"free" — you are the host. Two mitigations:

```powershell
powercfg /change standby-timeout-ac 0     # never sleep on mains power
powercfg /change hibernate-timeout-ac 0
```

The screen can still sleep; that costs nothing. Only standby kills the tunnel.
With sleep off and the boot task registered, a reboot brings everything back
by itself — which is as close to "anytime" as free-and-on-your-own-hardware gets.

### If you want truly always-on and still ₹0

**Oracle Cloud Always Free** is the only free tier large enough to actually run
this: their Ampere ARM allowance is several cores and tens of GB of RAM, free
with no time limit — far beyond what Google's or AWS's free tiers offer, and
enough for Remotion.

Worth knowing before you commit a weekend to it:

- **ARM**, so you need the ARM builds of Node, ffmpeg and Chromium. All exist
  on Ubuntu ARM, but it is not a copy-paste of the x86 steps below.
- **Capacity is genuinely hard to get** in popular regions; "out of host
  capacity" on Ampere is common and you may retry for days.
- A card is required for identity verification.
- Free-tier terms change. Check Oracle's current page rather than trusting this
  paragraph — two hardcoded model IDs in this project went stale inside a year,
  and cloud free tiers move the same way.

My recommendation: **start with the tunnel today** — it works in ten minutes and
costs nothing. Move to Oracle only if the PC-must-be-awake constraint actually
bothers you in practice, because it is a real afternoon of ARM debugging.

---

## Read this first: Vercel and Netlify cannot run this

Not a configuration problem — a shape mismatch. This app is not a website that
talks to APIs; it drives local binaries.

| It needs | Serverless gives you |
|---|---|
| ffmpeg, Chrome, Python/Manim, whisper | none of them |
| 8+ minutes for a render | 10–60 second function limit |
| writes to `data/` and `renders/` | read-only filesystem |
| a long-lived job queue | a process that dies after each request |
| gigabytes of MP4s | ephemeral `/tmp` |

Deploying the *portal* to Vercel while the *work* happens elsewhere is possible
but means building a job broker and shipping footage between two hosts. Not
worth it for a single-operator tool.

**Two options actually work.** Both need step 0.

---

## Step 0 — set a password (not optional)

This portal executes 39 commands on its host, spends your OpenRouter balance,
and reads your whole pipeline. On localhost that is fine. **Exposed without a
password, anyone who finds the URL owns the machine.**

```bash
# in the project root .env
FACTORY_PASSWORD=something-long-and-random
```

Then restart the portal. Verify before you expose anything:

```bash
curl -o /dev/null -w "%{http_code}\n" http://localhost:4600/studio   # want 307
curl http://localhost:4600/api/run                                    # want {"ok":false,...}
```

`307` and `not signed in` mean the gate is live. `200` means it is still open —
stop and fix it.

> The password goes in the **root** `.env`. Next normally only reads `.env` from
> its own folder, so `next.config.mjs` explicitly loads the root file. Without
> that, a password in the root would be silently ignored and the portal would
> stay open — which is why this is checked rather than assumed.

---

## Option A — Cloudflare Tunnel (recommended first)

Your existing machine, reachable over HTTPS, no migration, no new server, free.
Best when you are the only user and the PC is on when you work.

```bash
# once
winget install Cloudflare.cloudflared
cloudflared tunnel login
cloudflared tunnel create content-factory

# each time (or install as a service)
npm run dev --prefix apps/mission-control
cloudflared tunnel --url http://localhost:4600
```

You get a `https://….trycloudflare.com` URL. For a stable hostname and an extra
login layer, put it behind **Cloudflare Access** (free for up to 50 users) and
restrict it to your Google account — then you have two independent gates.

**Trade-off:** nothing runs while the PC is off or asleep. The `worker`
scheduler needs the machine awake.

---

## Option B — a small VPS (always on)

Right answer if you want the worker collecting trends overnight. ~$6–12/month
on Hetzner or DigitalOcean. **2 vCPU / 4GB RAM / 40GB disk** minimum — Remotion
renders are CPU-hungry and MP4s add up.

```bash
# Ubuntu 24.04
sudo apt update && sudo apt install -y ffmpeg git python3-venv fonts-dejavu
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs

# Chrome — Remotion and evidence capture both need a real browser
wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install -y ./google-chrome-stable_current_amd64.deb

git clone <your-repo> content-factory && cd content-factory
npm install
cp .env.example .env      # add FACTORY_PASSWORD + OPENROUTER_API_KEY

# math shorts (optional)
python3 -m venv .venv && .venv/bin/pip install manim

npm run build --prefix apps/mission-control
```

Keep it running and put TLS in front of it:

```bash
# /etc/systemd/system/factory.service
[Unit]
Description=Content Factory portal
After=network.target

[Service]
WorkingDirectory=/root/content-factory/apps/mission-control
ExecStart=/usr/bin/npm start
Restart=always
EnvironmentFile=/root/content-factory/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now factory
sudo apt install -y caddy
# /etc/caddy/Caddyfile  →  factory.yourdomain.com { reverse_proxy localhost:4600 }
sudo systemctl reload caddy
```

Caddy gets you HTTPS automatically. **Never expose port 4600 directly** — bind
the app to `127.0.0.1` and let the proxy be the only public surface.

The scheduler, in its own unit or a `screen`:

```bash
node packages/cli/bin/factory.js worker
```

### Two things that will bite you on a VPS

**Disk.** Renders are large and nothing prunes them automatically. Watch it, and
run `factory prune` periodically.

**Chrome needs `--no-sandbox` as root**, which is already passed. Better: run as
a non-root user.

---

## Uploading footage

Once the portal is remote, `D:\footage\take1.mp4` means nothing — that path is
on a machine you are no longer at. Studio has an **Upload** button on every
command that takes a file (AI Cut, Reframe, Mine Shorts).

Files land in `data/footage/`. The uploaded filename is **discarded** — only the
extension survives, and only from an allowlist. That is deliberate: a name like
`../../.env` would otherwise escape the folder, and `clip.mp4.exe` would sit on
disk as an executable. 4GB ceiling per file.

Practical flow: film on your phone → upload from the phone browser → hit
**AI Cut** → the VPS does the work.

---

## What stays manual, deliberately

| | Why |
|---|---|
| `factory worker` | a daemon that never exits — its own service, not a button |
| `factory auth-youtube` | interactive OAuth paste-back |
| `factory publish <id> --go` | the one real upload. Kept manual so it can never be a mis-click |

---

## Security summary

What was fixed to make this deployable at all:

- **SSRF in evidence capture.** Verified before the fix: capturing
  `http://169.254.169.254/…` succeeded, and on a cloud host that endpoint serves
  instance credentials. Now blocked, checked **after DNS resolution** — an
  attacker controls their own DNS, so validating the hostname string catches
  nothing.
- **Command execution is allowlisted.** The client sends a registry *key*, never
  a command line, and argv is built server-side. `x && echo pwned` arrives as a
  single argument (spawn with an args array, no shell).
- **Upload names are replaced, not sanitised.** Only an allowlisted extension
  survives.
- **The session cookie holds a hash**, is `httpOnly`, and is `secure` in
  production.

Still your responsibility:

- Put it behind HTTPS. The cookie is only marked `secure` in production, and a
  password over plain HTTP is a password given away.
- `data/` holds your API keys' *outputs* and your whole content plan. Back it up;
  it is gitignored.
- One password, no accounts. Fine for one operator — if others need access, put
  Cloudflare Access in front rather than sharing it.
