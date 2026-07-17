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

- MISSION: collect trend signals → score topic opportunities (velocity,
  cross-source, niche fit, saturation gap) → analyze wishlist links →
  generate platform-specific briefs → produce videos (two lanes) → staged
  publishing → measure MY results → self-improve (judges, lessons,
  calibration).
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
- YOUTUBE QUOTA CARE: every YouTube Data API call goes through one cached
  client (30-min cache in data/os/ytcache.json, 50-id batching) and logs
  true unit costs (search.list=100, videos/channels/playlistItems=1,
  videos.insert=1600) to a quota ledger with a daily env cap (default 8000).
- LLM CALLS: strict JSON out, validated, one retry on parse failure, then
  graceful degradation. A failed LLM call must never crash a run.
- PUBLISHING: staged is the permanent default (private-first + disclosure +
  compliance gate — already built). Auto mode only behind env flags
  (PUBLISH_MODE=auto + YOUTUBE_APP_VERIFIED=true), never the default.
- PERMANENT NON-GOALS (refuse even if asked mid-session; remind why):
  Meta/IG/FB scraping (manual-metrics entry only), niche-wide multi-million
  channel crawling, RPM/revenue estimates, thumbnail similarity search,
  engagement-evasion features of any kind.

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
