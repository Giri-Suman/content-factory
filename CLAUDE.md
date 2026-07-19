# Content Factory / Content OS

Code-first automated video studio + content intelligence system (separate
from the portfolio repo — this must NEVER be deployed to Vercel or imported
from portfolio-website). Node ESM monorepo, plain JavaScript, no TypeScript,
no test framework.

The system is evolving along `content-os-master-blueprint.md` (repo root),
ADAPTED to this repo: see GAP_PLAN.md for the module-by-module audit of what
EXISTS / is PARTIAL / is MISSING. Blueprint milestones are implemented one
at a time against that plan — never rebuild something the audit marks EXISTS.

## Commands

- `npm run doctor` / `node packages/cli/bin/factory.js <cmd>` — everything
  runs through the factory CLI: doctor, render, radar, script, math, shorts,
  edit, compliance, publish, auth-youtube, analytics
- Mission Control portal: start via `scripts/mission-control.cmd`
  (localhost:4600). Do NOT `npm --prefix` it from a shell — the space in
  "Program Files" breaks spawns; that's why the .cmd exists.
- Verification gate: there is no test suite. A phase/feature counts as done
  only when exercised end-to-end (render a file, probe it with ffprobe,
  inspect frames; drive portal flows in the browser).

## Knowledge files

- Read `lessons.md` (repo root) before retrying anything that failed once;
  append an entry (*tried → broke → rule*) after every failed attempt or
  surprise.

## Architecture

- `packages/cli` — the `factory` command; subcommands lazy-import from
  other packages. `packages/shared/src/config.js` owns env + repo paths.
- `packages/llm` — provider layer: anthropic > openrouter > ollama, picked
  by whichever key exists. EVERY caller must degrade gracefully keyless
  (heuristic/template fallback) — never hard-require an API key.
- `packages/pipeline` — voice (ElevenLabs w/ per-scene cache, SAPI
  fallback), render, math (Manim), clips, autoedit ("AI Cut": whisper
  word timestamps drive filler/backtrack cuts + karaoke ASS captions;
  keep transcription on the ORIGINAL file and remap word times through
  the keep-segments — never re-transcribe the edited master).
- `packages/publish` — compliance gate, YouTube upload, analytics.
- `renderers/code-report` — Remotion project (own package.json). Scene
  timeline lives in data/build/<id>/props.json; clips.js cuts by it —
  never transcribe our own renders.
- `apps/mission-control` — Next.js portal. API routes shell out to the CLI
  via lib/factory.js startJob (dynamic cross-package imports break under
  Next's webpack — always spawn, never import factory packages).
- Python: ALWAYS use the project venv `.venv\Scripts\python.exe`
  (Python 3.12 from D:\python312). System Python 3.14 cannot build
  manim's native deps. Manim scenes must be LaTeX-free (Text/shapes only)
  and pass the lint in packages/studio/src/mathStyle.js.

## Content OS spec (merged from the blueprint, stack-adapted)

- MISSION (Content OS v1): a locally running system that (1) collects
  trend signals from multiple sources, (2) scores topic opportunities for
  MY niche, (3) analyzes wishlist video links I paste, (4) generates
  platform-specific content briefs with timing + a manual publish
  checklist, (5) refreshes itself automatically. Later phases extend into
  production + staged publishing + self-improvement (judges, lessons,
  calibration).
- PUBLISHING PIPELINE (P0.1 lifted the Phase-1 fence; Phase 2 module):
  two modes. STAGED (default, permanent fallback): the system prepares
  everything — video file slot, title, description, tags, thumbnail,
  target time — as PublishItems; a human taps Publish per platform in the
  Publish Center. YouTube uploads go up private/unlisted with metadata set
  (the EXISTING packages/publish engine: compliance gate, disclosure,
  private-first) and the human flips them live. AUTO (env
  PUBLISH_MODE=auto, ships OFF): only after the YouTube API project
  passes Google verification (YOUTUBE_APP_VERIFIED=true) and the Meta app
  passes review (META_APP_REVIEWED=true); the code checks the flags at
  RUNTIME and staged is always the fallback.
- PHASE-2 MODULES: Publish Center, Title & Hook Lab, Niche Explorer,
  Keyword Gap Finder, Idea Bank & Series Planner, Calibration Loop,
  Quota Budget Manager, My Channel analytics ingestion.
- NICHE CONTEXT for all LLM prompts: senior front-end developer creating
  content on coding, AI automation, and AI tools, for developers +
  tech-curious freelancers, India + global English audience, timezone IST.
  The makeup channel is a SEPARATE capture-only lane (auto-editor) and is
  excluded from Content OS intelligence/briefs.
- STACK RESOLUTIONS (blueprint default → this repo): TypeScript → plain JS;
  Prisma/SQLite → JSON collections via `packages/shared/src/store.js`
  (data/os/*.json); zod → `store.js` validate helpers; node-cron worker →
  `factory worker` script; Anthropic SDK → existing `packages/llm` provider
  layer (anthropic > openrouter > ollama, keyless degradation mandatory).
- YOUTUBE QUOTA CARE (hard rule): every YouTube Data API call goes
  through the one cached client (30-min cache, 50-id batching) and MUST
  log true unit costs to the quota ledger (search.list=100,
  videos/channels/playlistItems=1, videos.insert=1600). Jobs must consult
  the daily budget allocator (P16; until it lands, the global
  YT_DAILY_UNIT_CAP pre-call gate, default 8000) before running.
- LLM CALLS: strict JSON out, validated, one retry on parse failure, then
  graceful degradation. A failed LLM call must never crash a run.
- PUBLISHING: staged is the permanent default (private-first + disclosure +
  compliance gate — already built). Auto mode only behind env flags
  (PUBLISH_MODE=auto + YOUTUBE_APP_VERIFIED=true), never the default.
- PERMANENT NON-GOALS (refuse even if asked mid-session; remind why):
  Meta/IG/FB scraping (manual-metrics entry only), niche-wide multi-million
  channel crawling, RPM/revenue estimates, thumbnail similarity search,
  engagement-evasion features of any kind.

### Data models (JSON collections via store.js — data/os/<name>.json)

- `items` — id, source, sourceType(reddit|hn|github|rss|youtube),
  externalId, title, url, author?, score, comments, publishedAt,
  fetchedAt, clusterId?, raw
- `snapshots` — id, itemId, score, comments, capturedAt
  (velocity = Δscore/Δhours between an item's last two snapshots)
- `clusters` — id, label, summary, opportunityScore, scoreBreakdown
  {velocity 0-40, crossSource 0-25, nicheFit 0-20, saturationGap 0-15},
  status(new|rising|fading), memberCount, updatedAt
- `watchlist` — channels: id, channelId, handle, title, subscriberCount,
  medianViews, shortsMedianViews; videos: per-video views/likes/comments,
  durationSec, outlierRatio
- `wishlist` — id, platform(youtube|instagram|facebook), url,
  mode(api|manual), metrics, contentAnalysis, verdict,
  predictedTier(S|A|B|C), createdAt
- `briefs` — id, topicClusterId?, wishlistEntryId?, kind(trend|evergreen),
  deadline?, payload, status(draft|approved|killed), createdAt
- `jobruns` — id, job, startedAt, ok, error?
- `titlepatterns` — id, template, exampleTitles, avgOutlierRatio,
  sampleSize, updatedAt
- `ideabank` — id, briefId?, title, pillar, effort(S|M|L),
  status(backlog|scheduled|made|retired), score, createdAt
- `publishitems` — id, briefId, platform, mode(staged|auto), assets,
  scheduledFor, publishedAt?, externalUrl?,
  status(preparing|ready|published|failed), golden60Done(bool)
- `myposts` — id, publishItemId?, platform, externalId, postedAt,
  hookPattern, pillar, lengthSec, title, statsSnapshots
- `quota` — id, date, endpoint, units, job (EXISTS since P3 as the
  YouTube gateway's ledger)
- Env keys (all via .env, never hardcoded): YOUTUBE_API_KEY,
  YT_DAILY_UNIT_CAP (default 8000), LLM keys via the existing packages/llm
  provider chain (ANTHROPIC_API_KEY + ANTHROPIC_MODEL honored; openrouter/
  ollama fallbacks keep everything degradable keyless).

### Phase-1 build checklist (one milestone per prompt; acceptance → commit)

- [x] P0 spec (this section) · P1 audit → GAP_PLAN.md (done at foundation)
- [x] P2 collectors: snapshots + velocity (Δpts/h, newest-10 pruned),
      per-source run summary, JobRun logging via withJobRun
- [x] P3 YouTube radar: cached+batched client, trending + niche heat,
      watchlist outliers (shorts/long medians split), saturation(topic),
      quota ledger + cap. Cycle estimate 610u (<1500 ✓). LIVE run pending
      YOUTUBE_API_KEY in .env — everything degrades cleanly until then
- [x] P4 scoring engine: LLM clustering (singleton fallback keyless) +
      4-component scoreBreakdown w/ stored inputs + new/rising/fading
      status; auto-runs after collect; Opportunities cards on Trends page
      expand into exact components. LLM clustering + saturation lookups
      activate when keys land
- [x] P5 wishlist analyzer: YT autopsy flow (API mode + 48h tracking via
      pollTracked) + IG/FB manual-metrics flow, 9-hook-pattern LLM
      analysis, transparent coded S/A/B/C rubric, Wishlist page w/ tier
      sort + tracking badges. YT flow live-check pending YOUTUBE_API_KEY
- [x] P6 brief studio: ONE-LLM-call multi-platform payload (validated,
      retry, keyless template-skeleton fallback), deterministic timing_ist
      (trend same-day / evergreen daily-slot queue) + checklist builder,
      Briefs page w/ platform tabs, inline hook/caption edit, Approve/Kill,
      deadline countdown, persisted tickable checklist
- [x] P7 dashboard wiring: Today = home (top-10 w/ one-click briefs,
      rising-fast deltas, outlier strip, awaiting-approval, To Post Today
      w/ inline checklists, Refresh now); Trends moved to /trends;
      Settings gains keyword editor, weight sliders (applied in scorer),
      quota meter, JobRun table
- [x] P8 worker: `factory worker` — collect+score 30m (github excluded),
      youtube+tracking 60m, deep refresh 6h, Morning Digest 08:00 IST
      (banner on Today); every tick guarded + JobRun-logged; Today polls
      60s so timestamps self-update. `--fast` = test cadences
- [x] P9 hardening: keyless drills verified on every surface (keys have
      never existed on this machine — degradation is the lived state),
      quota-cap gate proven pre-fetch (QUOTA_CAP at cap boundary), README
      Content OS section + mermaid + roadmap, full E2E chain run, tagged
      content-os-v1.0. PHASE 1 COMPLETE.

### Phase-2 build checklist (parity + publishing)

- [x] P0.1 spec patch (this edit)
- [ ] P10 Publish Center: PublishItems from approved briefs, staged
      YouTube upload via the existing publish engine, Golden-60 toggle,
      MyPost rows on publish
- [ ] P11 Title & Hook Lab: nightly pattern extraction (outlierRatio>=2),
      title/hook scorer wired into Brief Studio
- [ ] P12 Niche Explorer: budgeted channel discovery, 300-channel rotating
      cohorts, Shorts outliers tab (medians already split)
- [ ] P13 Keyword Gap Finder: autocomplete + LLM expansion, demand-proxy
      vs supply cards, no revenue estimates anywhere
- [ ] P14 Idea Bank & Series Planner: pillar/effort ranking, dedupe guard,
      Make Next card
- [ ] P15 Calibration Loop: my-channel ingestion, performance joins,
      weekly memo, guarded auto-tuning (N>=20, max ±10%/week), prediction
      scorecard
- [ ] P16 Quota Budget Manager: per-module allocator, live dashboard,
      failure-drill rerun, tag v2.0

## Hard rules

- No native Node modules (better-sqlite3 etc.) — no VS C++ toolchain on
  this machine. JSON files in data/ are the store.
- data/ and renders/ are generated state — gitignored, never commit them.
- C: drive is nearly full. Big caches/temp dirs go on D: (pip temp →
  data/piptmp, whisper/HF models → data/models).
- Compliance is non-negotiable: human review gate before publish, uploads
  are PRIVATE-first with synthetic-media disclosure, real upload needs
  `--go`, public needs an explicit flag, ≤2 uploads/day/platform. Never
  weaken these defaults.
- Windows quoting: multi-line git commit messages via `git commit -F <file>`
  (here-strings with quotes inside get mangled).
