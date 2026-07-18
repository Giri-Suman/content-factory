# Content Factory

Code-first automated video studio. One pipeline for every video:

```
Trend Radar → Script Studio → Voice (your clone) → Render Farm → Review Gate → Publisher → Analytics
   hourly        Claude         ElevenLabs        Remotion/Manim   HUMAN, 15-30m   YT/TT/IG     daily
```

Full master plan: https://claude.ai/code/artifact/eff26ba0-ee88-42f3-a7f5-b7f6d5d2f5b0

## Quickstart

```bash
cp .env.example .env      # fill keys as phases come online
npm run doctor            # verify the toolchain — zero install needed
npm install               # remotion + react + shiki (P1+)

# render an episode (16:9 + 9:16) from a script:
node packages/cli/bin/factory.js render renderers/code-report/examples/factory-online.json

# the daily loop (CLI):
node packages/cli/bin/factory.js radar          # scan + score trending topics
node packages/cli/bin/factory.js script <ID>    # draft a script from a trend (or a "topic")
node packages/cli/bin/factory.js render data/scripts/<id>.json

# or use the portal — everything above in one UI:
npm run dev --prefix apps/mission-control       # -> http://localhost:4600

# keep it fresh automatically (collect 30m / youtube 60m / deep 6h / digest 08:00 IST):
node packages/cli/bin/factory.js worker

# math shorts (Manim) + clip mining:
node packages/cli/bin/factory.js math gauss-sum --demo    # bundled demo, no key
node packages/cli/bin/factory.js math "why 0! = 1"        # LLM writes the scene
node packages/cli/bin/factory.js shorts <rendered-id>     # cut 1-3 clips from an episode

# AI Cut filmed footage — 100% local:
#   silence + filler-word ("um"/"uh") jump cuts, LLM backtracking of
#   self-corrections, noise cancellation, loudnorm, grade/vignette/fades,
#   punch-ins, karaoke captions per aspect, personal dictionary
node packages/cli/bin/factory.js edit "D:\footage\my-tutorial.mp4"
#   opt-outs: --no-punch --no-captions --no-denoise --no-fillers --no-backtrack
#   jargon spelling: copy data/dictionary.example.json -> data/dictionary.json
```

Math shorts need Manim in the project venv (kept off C: on purpose):
`D:\python312\python.exe -m venv .venv` then `.venv\Scripts\pip install manim`.
No LaTeX required — scenes are linted to use Text/shapes only.

## Publishing (safe by default)

```bash
node packages/cli/bin/factory.js auth-youtube      # one-time: you approve in browser
node packages/cli/bin/factory.js publish <id>      # compliance check + DRY RUN (nothing uploaded)
node packages/cli/bin/factory.js publish <id> --go # real upload, PRIVATE by default
node packages/cli/bin/factory.js publish <id> --go --public   # explicit, goes live
node packages/cli/bin/factory.js publish <id> --go --at "2026-07-13T15:00"  # scheduled
node packages/cli/bin/factory.js analytics         # pull stats -> category weights steer the radar
```

Publishing is gated: a compliance lint (render present, human review logged,
synthetic-media disclosure, no verbatim narration, ≤2/day/platform) must pass;
uploads are **private** unless you explicitly pass `--public`/`--unlisted`;
`--go` is required for any real upload (default is a dry run). The synthetic-
content disclosure is set programmatically on every upload.

## Mission Control (the portal)

Trends (scan/filter/draft) → Scripts (scene-by-scene editor, title/hook
options) → Math (Manim shorts + demos) → Approve & render (live job log) →
Renders (in-browser preview + “Cut shorts”) → Settings (radar categories +
provider status).

## Content OS (Phase 1 — Intelligence Core, v1)

Trend intelligence layered on the factory: collect → score → autopsy →
brief → publish checklist, refreshed automatically.

```mermaid
flowchart LR
  subgraph collect [every 30m]
    R[reddit/hn/rss] --> DB[(trends + snapshots)]
    G[github 6h] --> DB
    Y[yt trending+heat 60m] --> DB
  end
  DB --> S[score: velocity + crossSource + nicheFit + saturationGap]
  S --> C[(clusters)]
  W[wishlist autopsies] --> B[Brief Studio]
  C --> B
  YW[(watchlist outliers)] --> T[Today page]
  B --> T
  C --> T
  D[08:00 IST digest] --> T
  T --> M[manual publish checklist + Golden 60]
```

- **Setup:** `npm install` once; everything runs keyless with visible
  degradation (heuristic scoring, template briefs). Full power needs two
  free-tier keys in `.env`:
  `YOUTUBE_API_KEY` (Google Cloud Console → YouTube Data API v3) and one
  LLM key (`ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` / `OLLAMA_MODEL`).
  `YT_DAILY_UNIT_CAP` (default 8000) hard-gates YouTube spend; every call
  is 30-min cached, 50-id batched, and unit-logged to `data/os/quota.json`.
- **Commands:** `factory radar` (collect+score) · `factory score` ·
  `factory yt trending|heat|watch <handle>|outliers|saturation|quota` ·
  `factory wishlist add <url>|manual <form.json>|poll|list` ·
  `factory brief [top|<id>]` · `factory digest` · `factory worker [--fast]`
- **Portal:** Today (command center) · Trends · YouTube · Wishlist ·
  Briefs · Settings (keywords, score weights, quota, job log) at :4600.
- **Day-2+ roadmap:** wire briefs into the EXISTING Remotion production
  line + AI-Cut capture lane (blueprint P17/P20); prediction calibration —
  predictedTier vs actual 48h results once ~20 posts exist (P15); timing
  self-tuning from MY analytics replacing the public-research defaults;
  Title/Hook Lab + Idea Bank + judge network (Phase 2/3 of the blueprint).

## AI providers (pick one in .env)

| Provider | Cost | Quality | Setup |
|---|---|---|---|
| Anthropic | ~$10-20/mo | best writing | `ANTHROPIC_API_KEY` |
| OpenRouter | cheap → **free** (`:free` models) | varies by model | `OPENROUTER_API_KEY` |
| Ollama | **$0, runs locally** | depends on your hardware | `OLLAMA_MODEL` after `ollama pull` |

No key at all still works: heuristic trend scoring + fillable script templates.

Without ElevenLabs keys in `.env`, voice falls back to Windows TTS with
estimated word timings — fine for previews. Add `ELEVENLABS_API_KEY` +
`ELEVENLABS_VOICE_ID` and the same command uses your cloned voice with
exact word-level sync. Voice is cached per scene, so unchanged scenes
never re-bill the API.

`factory doctor` is the health check for the whole machine. It knows which
phase each dependency belongs to, so it tells you what's blocking *now* vs.
what can wait.

## Structure

```
packages/cli/       the `factory` command (doctor; later: render, radar, script, publish)
packages/shared/    env loading, repo paths, config
renderers/          P1: code-report (Remotion) · P4: math (Manim), shorts
apps/               P3: Mission Control dashboard (Next.js)
assets/brand/       palette, logo, intro sting, licensed SFX/music only
data/               (gitignored) SQLite: trends, jobs, analytics
renders/            (gitignored) finished MP4s
```

## Phase roadmap

| Phase | Deliverable | Status |
|-------|-------------|--------|
| P0 | Monorepo + `factory doctor` | **done** |
| P1 | Code Report renderer — script.json → MP4 (16:9 + 9:16) | **done** |
| P2 | Trend Radar + Script Studio (publishing starts) | **done** |
| P3 | Mission Control dashboard (localhost:4600) | **done** |
| P4 | Math engine (Manim) + Shorts factory | **done** |
| P5 | Publisher (YouTube) + compliance gate + analytics loop | **done** |
| P6 | Auto-Editor for filmed footage (separate makeup channel) | **done** |

## P0 homework (human tasks — nothing here can be automated)

1. **Voice clone** — record ~30 min of clean speech (quiet room, consistent
   mic distance, natural pace). Create an ElevenLabs professional voice
   clone → paste `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` into `.env`.
2. **YouTube API** — Google Cloud Console → new project → enable
   *YouTube Data API v3* → OAuth client (Desktop) → `YT_CLIENT_ID` +
   `YT_CLIENT_SECRET` into `.env`. (Refresh token is generated in P5.)
3. **Anthropic key** — console.anthropic.com → `ANTHROPIC_API_KEY`.
4. **Brand** — channel name + handle, 2–3 brand colors, pick an intro-sting
   concept (rendered later with the portfolio repo's Three.js render-engine).

## Rules the factory enforces (non-negotiable)

- Every video passes the **Review Gate** — a human edit + approval click.
- Own-voice clone only. No stock AI voices.
- Disclosure flags set programmatically wherever synthetic media is present.
- No verbatim article narration; no copyrighted meme clips.
- Per-platform native renders; max 2 uploads/day/platform.
