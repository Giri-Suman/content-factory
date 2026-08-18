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
"free" — you are the host.

But this matters far less than it sounds, because **the part that wanted 24/7
no longer runs here at all.** See "Trend collection runs in the cloud" below.
What is left needs the PC on only while you are actually using it:

| | Needs the PC awake? |
|---|---|
| Trend collection | **no** — runs on GitHub Actions every 6h |
| Portal (browse, approve, read reports) | only while you use it, like any app |
| Renders, edits, captures | on-demand only |
| Publishing | manual by design anyway |

If you *do* want the portal reachable at all hours:

```powershell
powercfg /change standby-timeout-ac 0     # never sleep on mains power
powercfg /change hibernate-timeout-ac 0
```

The screen can still sleep; that costs nothing. Only standby kills the tunnel.

---

## Trend collection runs in the cloud (no laptop)

`radar collect` was the only piece that wanted the machine on constantly. It
doesn't need to be *this* machine: the radar package has **zero dependencies**
and needs no Chrome, ffmpeg or Python. It fetches feeds, scores them, and writes
one 1.1MB JSON file.

So [`.github/workflows/collect.yml`](.github/workflows/collect.yml) runs it on
GitHub's runners instead.

**Setup — add these as repo secrets** (Settings → Secrets and variables →
Actions). Only the first is required:

| Secret | Effect if missing |
|---|---|
| `OPENROUTER_API_KEY` | **required** — without it scoring falls back to defaults and every cluster ties |
| `REDDIT_CLIENT_ID` / `_SECRET` | keyless mode samples only **3 of 15** subreddits per run |
| `YOUTUBE_API_KEY` | no YouTube signal in the mix |
| `OPENROUTER_FREE_MODEL` | uses the built-in default |

Then trigger the first run: **Actions → "collect trends" → Run workflow**. That
also creates the data branch.

### Budget, measured not guessed

A real run took **651s (10.9 min)**. This repo is private, so Actions minutes
are metered — 2000/month on the Free plan:

| Cadence | Runs/day | Minutes/month | |
|---|---|---|---|
| every 4h | 6 | ~1950 | 98% of budget — one retry blows it |
| **every 6h** | **4** | **~1300** | **chosen — 65%, real headroom** |

Four collections a day is plenty: velocity scoring only needs the same item seen
2+ times. If you ever make the repo **public**, Actions minutes become unlimited
and hourly is free — weigh that against publishing your whole content plan.

### Getting the data back to your machine

State lives on an orphan `factory-data` branch, force-pushed as a single commit
each run — durable, and the repo never grows.

```bash
npm run sync:trends          # pull it down
npm run sync:trends:check    # compare local vs remote, change nothing
```

The sync **refuses to overwrite a larger local file** unless you pass `--force`.
`trends.json` is cumulative, so a smaller remote means the cloud lost state, not
that it found less — and clobbering weeks of local collection with it is the one
mistake here you cannot undo. A `.bak` is kept regardless.

### What stays on your machine

Everything that needs a binary: Remotion renders, Manim, ffmpeg edits, whisper
transcription, Chrome evidence capture. Those are on-demand, so "the laptop must
be on" reduces to "the laptop must be on when you ask it to render" — which was
never the complaint.

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

**Trade-off:** the portal is unreachable while the PC is off or asleep. Trend
collection is not affected — that runs on GitHub Actions.

---

## Option B — a small VPS (always on)

Now a weaker case than it used to be: collecting trends overnight is what a VPS
was mainly for, and GitHub Actions does that for free. Reach for this only if you
want the **portal itself** reachable 24/7. ~$6–12/month
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

## Downloading finished videos from anywhere (Cloudflare R2)

Renders live in `renders/` on this PC and the portal streams them from there, so
a finished video is unreachable the moment the machine sleeps. Pushing each one
to R2 fixes that: **the laptop becomes purely a render machine** — it produces
the file, pushes it, and nothing afterwards needs it awake.

### It cannot affect coderfact.com

This matters if you host a site on the same Cloudflare account. **coderfact.com
is served by a Worker named `coderfact`** (see the portfolio repo's
`wrangler.jsonc`). This feature stays entirely clear of it:

| | |
|---|---|
| Uses | R2's **S3-compatible API** only |
| Never creates | DNS records, Workers, Pages projects, custom domains |
| Never uses | a public bucket (downloads are presigned URLs instead) |
| No wrangler config | there is **no** `wrangler.*` file in this repo, so nothing here can `wrangler deploy` over your site |

R2 is object storage, a different product from Workers. A bucket has no domain
and no routes. Scope the API token to the one bucket and the blast radius is
that bucket.

> The one way this *could* go wrong is a `wrangler` config in this repo reusing
> the name `coderfact` — deploying that would overwrite the portfolio Worker.
> That is why this repo has no wrangler config at all, and should not gain one.

### Setup

Cloudflare dashboard → R2 → create a bucket → Manage API Tokens → Create with
**Object Read & Write**, scoped to that bucket. Then in `.env`:

```bash
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=content-factory-renders
```

Unconfigured is a supported state — everything skips silently.

### Use

```bash
npm run factory -- r2 status          # what is backed up, what is not
npm run factory -- r2 push --all      # backfill everything
npm run factory -- r2 url <renderId>  # shareable links, up to 7 days
```

All four are also buttons in the portal under **Ship**. After setup, every
`render` pushes automatically — and a failed upload **never fails the render**,
because ~10 minutes of CPU already went into it and the file is valid locally
regardless.

### Cost

Free tier is 10GB. Finished shorts average **3.0MB**, so that is roughly **3,400
videos**; the 38 renders currently on disk total 96MB. R2's defining feature is
**zero egress fees**, so downloads are free no matter how often you or anyone
else pulls a file.

### In the portal

Every video on the Renders page now has a **Download** button. Previously it was
a `<video>` player with no download link — saving a file meant knowing to
right-click, which is fine for you and confusing for anyone else.

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
