# Content Factory — Handbook

**What this is:** everything the factory can do, organised by what you're making.
`SYSTEM.md` explains how it works internally. This one is for *doing*.

Every command is `node packages/cli/bin/factory.js <cmd>`.
Tip: alias it once — `doskey f=node "D:\youtube\automated website\content-factory\packages\cli\bin\factory.js" $*` — then it's just `f radar`.

---

## The 30-second version

```bash
f radar collect          # 1. find what people are talking about
f evidence report        # 2. which of it actually deserves a video
f brief                  # 3. write the plan (hooks, title, beats, caption)
#    approve it at localhost:4600/briefs        <- you decide
f produce <briefId>      # 4. make the video
f publish <id>           # 5. dry run, then --go to upload (private)
```

Two steps need you: **approving the brief** and **tapping publish**. Everything else runs itself.

---

## Family portal — use it from anywhere

Open [content-factory-viewer.pages.dev](https://content-factory-viewer.pages.dev)
and enter the shared family password. The password is stored as a Cloudflare
Pages secret; do not put it in this handbook, a script, or a Git commit. Anyone
who knows it receives the same portal access, so change the Pages
`FACTORY_PASSWORD` secret if it is shared outside the family.

The portal is the shared workspace. Its state, scripts, footage, render files,
job records, and finished downloads live in private Cloudflare R2 storage rather
than on one laptop. You can open it from a phone or another computer to:

- read the dashboard and research data;
- create, edit, approve, and review briefs and scripts;
- upload footage from the browser into R2, import a shared Google Drive
  video when Drive is configured, preview it, and download finished files;
- start supported jobs and watch them move from queued to running to done;
- review renders, captions, thumbnails, quality checks, lessons, analytics,
  costs, ideas, keywords, and workspace settings.

The dashboard has 24 working areas:

| Area | What it is for |
|---|---|
| Today, Trends, YouTube, Keywords, Ideas, Wishlist, Lab | Find and rank topics, hooks, search demand, competitor signals, and ideas |
| Studio, Briefs, Scripts, Production, Math, Motion | Plan, approve, script, generate, and review video work |
| Footage, Renders, Packaging, Tools, QC | Upload, edit, preview, download, caption, thumbnail, and quality-check content |
| Catalog, Playbooks, Lessons, Analytics, Cost | Reuse a brief across formats, learn from results, and track usage and spending |
| Publish, Settings | Review the publishing queue and manage safe workspace settings |

### What runs in the cloud and what still needs the laptop

| Capability | Works while the laptop is off? | Where it runs |
|---|---:|---|
| Sign in, browse every portal page, read shared data, edit briefs/scripts/settings | Yes | Cloudflare Pages + R2 |
| Upload browser footage, preview/download R2 files | Yes | Browser + private R2 |
| Import a shared Google Drive file | Yes, when Drive secrets are configured | GitHub Actions + Drive + R2 |
| Trend collection, supported renders, edits, captions, Manim, ffmpeg, whisper | Yes, when GitHub Actions and its secrets are configured | GitHub-hosted Linux runner + R2 |
| Automatic trend refresh and Today digest | Yes, when GitHub Actions R2 secrets are configured | GitHub Actions every six hours, then R2 |
| Queue status and completed job history | Yes | R2 |
| Old local state migration | One time only | `factory sync push` on the laptop |
| Commands not enabled for GitHub Actions | No | Laptop queue watcher |
| Browser/Chrome evidence capture, local-only AI such as Ollama, or any local binary not installed in the cloud runner | No | Laptop |
| YouTube OAuth and the final `publish <id> --go` action | No — deliberately manual | Laptop terminal |

Browser footage uploads use a signed direct R2 request when Pages has R2
signing credentials. Without them, the portal automatically sends 8 MB parts
through its R2-bound Worker. Either path stores the file in the same private
bucket; uploading does not need the laptop. A failed or interrupted multipart
upload can be retried from the browser; unfinished R2 parts expire automatically.

Cloud jobs are marked `github-actions`. They start on GitHub and the laptop
watcher ignores them. Laptop fallback jobs are marked `laptop`; they wait in R2
until the queue watcher runs. The installed Windows Startup shortcut starts that
watcher after sign-in, so queued fallback work resumes automatically. A fully
powered-off laptop cannot wake itself; scheduled wake from sleep is optional.

Today's **Refresh now** queues a full collect. When the portal reports “running
on the laptop,” it can take 7–14 minutes; keep the page open to see completion,
or reopen Today later. The separate scheduled collect runs at about 08:00,
14:00, 20:00, and 02:00 IST in GitHub Actions. It publishes refreshed trends,
scores, and the date's morning digest directly to R2, so Today can update while
the laptop is off. GitHub's actual start time can drift from the scheduled time.
The scheduled workflow needs the repository's four `R2_*`
secrets. If they are missing, its run fails visibly rather than silently
updating a data branch the portal does not read.

At present the portal reports `executor: laptop` from `/api/run`: on-demand
buttons, including **Refresh now**, use the Windows queue watcher. The scheduled
cloud collection above runs separately. To move on-demand jobs to GitHub Actions,
configure `GITHUB_ACTIONS_TOKEN`, `GITHUB_REPOSITORY`, and `GITHUB_REF` in the
Cloudflare Pages environment; verify `/api/run` reports `github-actions` after
redeploying. Until then, the laptop must be on and signed in for those jobs.

Refresh updates research and opportunity scores; it does not move an old brief
to a new publishing date. **To Post Today** contains briefs due today (plus
approved briefs without a date). Older unfinished briefs and old drafts appear
as a backlog count with a link to Brief Studio, where their original dates and
checklists remain available for review.

**Generate Briefs** on a Today or Trends opportunity, or **Brief it** on a
Wishlist entry, passes that exact item to the job. Brief Studio shows the
queued/running result and reloads the new draft when it finishes. When a laptop
executes the job, it first pulls the current shared state from R2, so a newly
collected cloud opportunity can be briefed without a manual sync.
If both configured free AI providers are throttled, the job saves a clearly
labelled fill-in template for that same selected item; it does not invent a
different topic. Edit the template or retry generation when provider capacity
returns.

The portal also follows queued Trends and YouTube scans, keyword passes,
Wishlist URL analyses, Idea Bank syncs, playbook refreshes, lesson distillation,
and Publish Center staging until each job finishes. Idea Bank series edits,
IG/FB manual Wishlist metrics, lesson and prompt decisions, QC escalation
resolution, and Golden 60 checks save to R2 immediately. The Title Lab scores
titles and hooks instantly in its labelled heuristic mode. AI title rewriting
remains a local CLI capability when an AI provider is available.

The Publish Center can stage an approved brief and record a manually posted
item from the portal. Attaching a laptop file path and uploading to YouTube
still require the authenticated laptop publisher. The portal reports that
limit explicitly instead of claiming an upload has started. Newsletter
compilation and other buttons without a cloud-safe command also explain their
local requirement.

To test the cloud-backed portal locally:

```powershell
cd "D:\youtube\automated website\content-factory"
npx wrangler login                 # once per Windows profile
npm run dev:cloud --workspace @factory/mission-control
```

Open `http://127.0.0.1:4700`. This starts the local portal, loopback runner,
and laptop queue watcher together. Press Ctrl+C to stop them.

---

## The four verticals

Each has a different lane. That's the single most important thing to understand:

| Vertical | Lane | Meaning |
|---|---|---|
| **Coding** | hybrid | mostly rendered; film only if you want a face |
| **AI automation** | hybrid | same — screen + code + narration |
| **Math** | synthetic | fully automated, no camera ever |
| **Makeup / Nails** | capture | **you film it.** The factory plans, cuts and packages |

`produce` routes automatically. Ask for a makeup video and it hands you a shot list instead of rendering one — because a beauty result on real skin cannot be faked.

---

# 1. Coding

**What it makes:** rendered code videos — syntax-highlighted frames, typing animation, fake terminal, before/after diffs. No camera needed.

### Do it
```bash
f radar collect                       # HN, GitHub, Show HN, Reddit, newsletters
f evidence report                     # what has real evidence behind it
f brief                               # brief the #1 cluster
f produce <briefId>                   # → rendered video, judged, ready
```

### Coding-only tools
```bash
f capture tool Cursor https://cursor.com    # landing + pricing + docs + mobile shots
f claims map <briefId>                      # every factual claim + what backs it
f capture claim <briefId> "Cursor is $20/mo" https://cursor.com/pricing
f steps <renderId>                          # burn STEP 1/5 callouts
f edit "D:\footage\screencast.mp4" --screencast   # auto-cut + remove dead screen time
```

**Screencasts:** `--screencast` adds dead-screen removal — the build waits and reading pauses that silence detection can't see, because you're often still talking over a frozen editor. It only cuts where the screen is frozen **and** you're silent, so explaining something over a still screen survives.

**Tool reviews:** capture the pricing page *before* you claim a price. `capture claim` attaches the screenshot as the receipt — so "$20/month" is a dated screenshot, not a guess.

**12 motion effects** fit coding: `code-rain`, `text-mask`, `glitch-text`, `word-punch`, `terminal`, `zoom-punch`…

**Seasonal windows:** placement season (Jul–Sep), Hacktoberfest (Oct), Advent of Code (Dec), appraisal season (Mar–Jun), new-year learn-to-code (Jan).

---

# 2. AI automation

**What it makes:** the same rendered pipeline as coding, tuned to agents, workflows and tool demos.

### Do it
```bash
f radar collect                       # includes Ben's Bites + TLDR AI newsletters
f evidence quotes                     # real HN comments, verbatim + attributed
f brief
f produce <briefId>
```

Newsletters are the honest proxy for X: those editors monitor it full-time, so you get the signal without scraping anything.

### Worth knowing
- `f evidence quotes` gives you **real community language** — a quoted complaint beats a summary as a hook
- `f capture tool <name> <url>` for any AI tool you review
- `f claims map` — AI tools change pricing constantly; a dated screenshot protects you
- **11 effects** fit: `particle-field` (the network look), `code-rain`, `glitch-text`, `text-mask`

---

# 3. Math

**What it makes:** fully automated Manim animations. The only vertical that needs nothing from you but a topic.

### Do it
```bash
f math "why 0! = 1"                   # LLM writes the scene, renders it
f math gauss-sum --demo               # bundled demo, no AI key needed
```

### What it handles for you
- **No LaTeX required** — scenes are linted to Text and shapes only
- **Overlap protection** — Manim never removes anything on its own, so scenes are checked for text piling up and get one automatic revision pass
- **Safety lint** — no file access, no randomness, no network in generated scenes
- **7 effects** fit math: `odometer` (counts to the payoff number), `word-punch`, `aurora-mesh`

**Seasonal:** board exams (Feb–Mar), JEE/NEET (Jan), Pi Day (Mar 14), back to school (Jun).

**The gotcha:** a Manim render takes minutes. Start it and go do something else.

---

# 4. Makeup & Nails

**What it makes:** it does *not* make the video — you film it. The factory does everything around the filming.

### Do it
```bash
f capabilities seasonal makeup        # what has a deadline right now
f brief topic "sweat-proof base for Durga Puja"
#    approve at localhost:4600/briefs
f produce <briefId>                   # → shot list + teleprompter (does NOT render)
#    ... you film ...
f edit "D:\footage\my-take.mp4"       # cuts, captions, colour, fades
f reframe "D:\footage\wide.mp4"       # 16:9 → 9:16, follows the motion
```

### What you get before filming
A **5-shot list** with durations, a **teleprompter script** speed-matched to your target length, and the gotcha for the niche:

> lock white balance — auto-WB shifting between open and reveal destroys the before/after

### Two rules the system enforces
- **No skin smoothing, ever.** Any blur filter entering the edit chain throws an error. Viewers are judging a real product on real skin; a beauty filter destroys the only thing the video is for.
- **Claims need receipts.** "Lasted 8 hours" is a testable claim. `f claims map <briefId>` lists them; attach your timestamped photo with `f claims receipt`.

**Seasonal is where the money is here:** Diwali, Durga Puja, Karwa Chauth, wedding season (Nov–Feb), Holi, Raksha Bandhan. Each has a **publish-by date** — three weeks *before* the festival, because shipping Diwali content on Diwali is late.

**12 effects** fit beauty: `grain-noise` (flatters skin), `gradient-blob`, `macro-vignette` (close hand shots), `split-before-after` — *the most screenshotted frame in beauty content*.

---

# Everything else, by job

## Find something to make
| Command | What it does |
|---|---|
| `radar collect` | sweep 17 sources — HN, Show HN, GitHub, Product Hunt, Reddit, newsletters, press |
| `radar score` | group into topics, score them |
| `evidence report` | **the one to trust** — which topics have real evidence, not just a high score |
| `evidence quotes` | real community sentences, attributed |
| `evidence ground` | why a topic was accepted or rejected |
| `capabilities seasonal [niche]` | date-driven demand with publish-by dates |
| `keywords` | what people search vs what exists |
| `wishlist` | analyse a post you admire (9 hook patterns) |
| `yt trending\|heat\|watch\|discover\|outliers` | YouTube-side signals (needs API key) |
| `ideabank` | your idea backlog, ranked |
| `lab` | title & hook scoring |
| `score` | re-score clusters without re-collecting |

## Plan it
| Command | What it does |
|---|---|
| `brief` | top cluster → hooks, title, beats, caption, blog outline |
| `brief topic "<anything>"` | brief a specific idea |
| `claims map <briefId>` | every factual claim + what backs it |
| `claims receipt <id> "<claim>" :: "<proof>"` | attach your evidence |
| `capture tool <name> <url>` | 4-shot review set |
| `catalog fanout <id>` | one brief → carousel, blog, newsletter, Pinterest |
| `script <id | "topic">` | draft a script.json directly, skipping the brief |
| `catalog blog <id>` | brief → citation-optimised blog post |
| `catalog newsletter` | compile the queued items into an issue |

## Make it
| Command | What it does |
|---|---|
| `produce <briefId>` | the whole conveyor — routes by vertical automatically |
| `batch 3` | produce several, cost-capped |
| `edit <file>` | auto-cut your footage: silences, "um", retakes, captions |
| `longform <file>` | mine Shorts from your own long recording |
| `reframe <file>` | 16:9 → 9:16 following the motion |
| `math "<topic>"` | Manim short |
| `shorts <renderId>` | cut clips from a finished video |
| `render <script.json>` | render a script file straight to MP4 (16:9 + 9:16) |
| `steps <renderId>` | burn STEP 1/5 callout overlays |
| `catalog carousel <id>` | 7 branded slides for an IG carousel |
| `motion list\|suggest\|bench` | the 22-effect catalog |

## Package it
| Command | What it does |
|---|---|
| `thumbnails <id>` | 2 variants, scored |
| `tools captions <id>` | .srt/.vtt + reading-speed + advertiser-risk check |
| `tools chapters <id>` | chapter markers |
| `tools silent <id>` | audio-free copy for muted autoplay feeds |
| `humanize script <id>` | strip AI-writing tells |
| `qc <id>` | run all five judges |

## Ship it
| Command | What it does |
|---|---|
| `auth-youtube` | one-time login |
| `publish <id>` | **dry run** — uploads nothing |
| `publish <id> --go` | real upload, **private** by default |
| `center` | the publish queue |
| `compliance <id>` | what's blocking publication |

## Learn from it
| Command | What it does |
|---|---|
| `analytics` | pull real stats |
| `calibrate` | what you predicted vs what happened |
| `lessons` | rules learned, fed back into generation |
| `digest` | today's brief |
| `playbook` | per-platform rules re-derived from your results |
| `prompts` | versioned prompts — you approve every change |

## Keep it healthy
| Command | What it does |
|---|---|
| `doctor` | is the toolchain OK? |
| `health` | is the **output** OK? (different question) |
| `ai` | which AI tier is live + your real balance |
| `ai models` | current free models (the list rotates) |
| `capabilities report` | what this machine can actually run |
| `capabilities licenses` | which models are safe to monetise |
| `humanize audit` | how machine-written your copy reads |
| `prune` | clean old data (dry run by default) |
| `worker` | run everything on a schedule |
| `dryrun` | prove the whole pipeline works |
| `help` | the built-in command list |

---

## The AI tiers

```bash
f ai                      # what's live
f ai set script best      # per task
```

| Tier | Cost | Model |
|---|---|---|
| `free` | **$0** | gemma-4-26b — currently everything runs here |
| `cheap` | ~$0.0003 | DeepSeek V4 Flash |
| `medium` | ~$0.009 | Gemini 3.6 Flash |
| `best` | ~$0.03 | Claude Opus 5 |

Tiers only fall **down**, never up — you're never charged more than you picked.

---

## Portal or terminal?

**Everything is a button now.** Open **Studio** on the family portal, or run it
locally at `http://127.0.0.1:4700/studio`, pick your vertical, and the commands
appear in workflow order — find → plan → make → package → ship → learn. Buttons
and `factory <cmd>` run exactly the same checked-in command registry.

Three things stay in the terminal on purpose:

| | Why |
|---|---|
| `factory worker` | a daemon that never exits — a button would hang the job runner |
| `factory auth-youtube` | opens Google's OAuth consent and waits for a paste-back |
| `factory publish <id> --go` | the one real upload — kept manual so it can never be a mis-click |

## The portal

```bash
npm run dev --prefix apps/mission-control      # localhost:4600
```

For the ordinary local Node version use `localhost:4600`. For the real
Cloudflare Pages runtime and R2 bucket, use `npm run dev:cloud --workspace
@factory/mission-control` and open `localhost:4700` instead.

**Studio** is the one to start with — every command, grouped by vertical.
**Today** shows what needs attention, **Briefs** approves or kills a plan,
**Footage** and **Renders** handle files, **Motion** previews all effects,
**Packaging** and **Tools** prepare delivery assets, and **Publish** keeps the
final upload deliberate.

---

## Rules that can't be turned off

1. **You approve every brief.** `produce` refuses a draft.
2. **Uploads are private** unless you explicitly say otherwise. `--go` required for any real upload.
3. **No skin smoothing** in the edit chain.
4. **No downloading other people's videos.**
5. **No Instagram/Facebook scraping** — manual metrics only.
6. **No invented facts.** Unbacked numbers get flagged before publish.
7. **≤2 uploads per day per platform.**

---

## When something looks wrong

| Symptom | Check |
|---|---|
| briefs full of `[fill:]` | `f ai` — no AI tier reachable |
| everything scores the same | `f evidence report` — nothing cleared the floor, that's honest |
| a filter "doesn't work" | it may be a row cap — look for "showing 60 of 120" |
| AI calls failing | `f ai models` — free model IDs rotate and go stale |
| video won't publish | `f compliance <id>` — it lists exactly what's blocking |

**Read `lessons.md` before retrying anything that failed once.** Every past mistake is written down there as *tried → broke → rule*.
