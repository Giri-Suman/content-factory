# Content Factory — how the whole thing works

A code-first video studio: it finds what to make, writes it, renders it, checks
it, and stages it for publishing. ~19,000 lines of plain-JS ESM across 8
packages, 42 CLI commands, and a Next.js portal.

This document is the map. `README.md` is the feature reference; this explains
**how the parts fit together and what state each one is actually in**.

---

## 1. The pipeline, end to end

```
DISCOVER          PLAN             PRODUCE          PACKAGE        PUBLISH        LEARN
─────────         ────             ───────          ───────        ───────        ─────
radar collect  →  evidence      →  produce       →  thumbnails  →  center      →  analytics
  HN/GitHub/       (does it          compile         2 variants     staged,        real stats
  Reddit/RSS       deserve a         script                         private-        ↓
  ↓                video?)           ↓                             first        calibrate
scored +           ↓               voice (TTS)         ↓              ↓            predictions
clustered        brief             ↓                 captions      YOU tap        vs reality
  ↓                (hooks,         render             .srt/.vtt     publish        ↓
evidence           title,          (Remotion)          ↓                        lessons
floor              beats,           ↓                description                  ↓
  ↓                caption)        5 judges           + chapters              injected back
quotes             ↓                ↓                                          into generation
attached         YOU approve      pass → ready
                 (human gate)     fail → regenerate ×3 → escalate
```

Six stages. Two of them **require a human by design** — brief approval and the
publish tap. Everything else is automated.

---

## 2. Where it actually stands

Being precise about this matters more than the feature list.

| | Status |
|---|---|
| Render pipeline | **Working.** Produced a real 26.5s video in 4.6 min at $0.00 |
| AI generation | **Working** on the free tier — real hooks, titles, beats, blog outlines |
| Trend collection | **Working.** 120 clusters from HN/GitHub/Reddit/RSS |
| Evidence floor | **Working.** 10–13 of 120 clusters clear the bar |
| Community quotes | **Working.** HN discussions attached, verbatim + attributed |
| Judges / QC | **Working.** 77 critiques logged |
| Publishing | **Blocked** — needs your YouTube OAuth credentials |
| Calibration loop | **Starved** — needs published posts with real stats |
| Effect→retention ranking | **Starved** — needs ~20 tagged published posts |

Current data: **29 briefs (3 real, 26 legacy `[fill:]` templates), 120
clusters, 18 render dirs, 36 staged post records, 0 actually published.**

The honest summary: the machine works, and it has never been used in anger.
Every "learning" subsystem — calibration, lesson distillation, effect
ranking — feeds on published results, and there are none yet. Shipping one
real video unblocks more than any new feature would.

---

## 3. The 42 commands, by stage

### Discover
| Command | What it does |
|---|---|
| `radar collect` | sweep HN, GitHub trending, Reddit, RSS; score and snapshot |
| `radar score` | cluster items, compute opportunityScore + evidence level |
| `evidence report` | **which clusters actually deserve a video** (the one to trust) |
| `evidence quotes` | real community language, verbatim and attributed |
| `evidence ground` | per-member entity-grounding decisions |
| `yt trending\|heat\|watch\|discover\|outliers` | YouTube-side signals (needs API key) |
| `keywords` | keyword-gap: demand proxy vs supply |
| `wishlist` | manual autopsies of posts you admire (9 hook patterns) |

### Plan
| Command | What it does |
|---|---|
| `brief` | top cluster → hooks, title, beats, caption, blog outline |
| `ideabank` | rank ideas by pillar × effort × freshness |
| `lab` | Title/Hook Lab scoring |
| `catalog formats\|fanout\|carousel\|blog\|newsletter` | format registry + derivative assets |
| `playbook` | per-platform rules re-derived from your outcomes |

### Produce
| Command | What it does |
|---|---|
| `produce <briefId>` | the conveyor: compile → voice → render → judge → ready |
| `script` / `render` | the individual steps |
| `batch <n>` | sequential production with a cost ceiling |
| `edit <file>` | AI Cut on your own footage (silence/filler cuts, captions) |
| `longform <file>` | mine Shorts from **your own** long recording |
| `reframe <file>` | smart 16:9 → 9:16 (finds the motion, not blind center-crop) |
| `math <topic>` | Manim math shorts |
| `shorts <renderId>` | cut clips from a rendered episode |
| `steps` | burn step-callout overlays |
| `motion list\|suggest\|bench` | the effect catalog (see §5) |

### Package
| Command | What it does |
|---|---|
| `thumbnails` | 2 variants, scored by a judge |
| `tools captions\|chapters` | `.srt`/`.vtt` sidecars + chapter markers |
| `humanize` | strip AI-writing tells (see §5) |
| `qc` | run the judge network |

### Publish
| Command | What it does |
|---|---|
| `auth-youtube` | one-time OAuth |
| `publish <id>` | compliance lint + **dry run** (uploads nothing) |
| `publish <id> --go` | real upload, **private** by default |
| `center` | Publish Center queue |
| `compliance` | the pre-publish gate |

### Learn
| Command | What it does |
|---|---|
| `analytics` | pull real stats → steer the radar |
| `calibrate` | predictions vs your actual results |
| `lessons` | distilled rules, injected back into generation |
| `prompts` | versioned prompts (you approve every promotion) |
| `digest` | daily brief |

### Ops
`doctor` (toolchain) · `health` (**output** quality, not toolchain) ·
`prune` (data hygiene, dry-run default) · `worker` (scheduler, singleton-locked) ·
`ai` (tier config) · `dryrun` (full pipeline proof) · `tools` (creator utilities)

---

## 4. The AI layer — four tiers

Every AI feature picks a **tier**, not a provider.

| Tier | Cost/call | Leads with |
|---|---|---|
| `free` | **$0** | `google/gemma-4-26b-a4b-it:free` |
| `cheap` | ~$0.0003 | DeepSeek V4 Flash |
| `medium` | ~$0.009 | Gemini 3.6 Flash |
| `best` | ~$0.03 | Claude Opus 5 |

```bash
factory ai                    # what's ready + real account balance
factory ai models             # current free roster (it rotates)
factory ai set script best    # per-task
```

Three rules that matter:

- **Chains only fall DOWN** (`best → medium → cheap → free`, 8 options deep).
  You are never silently charged above the tier you picked.
- **The free tier is chosen for reliability, not size.** OpenRouter's free pool
  is congested *per model*; `gemma-4-31b` measured 0/4 while `gemma-4-26b`
  measured 4/4. Each tier keeps an alternate so congestion falls sideways
  before falling down a tier.
- **Model ids rot.** Two defaults 404'd within a year, each silently dropping
  the system to templates. Override with `OPENROUTER_*_MODEL` env vars.

Non-LLM services are tiered too: `voice` (SAPI → ElevenLabs), `image` (HTML →
Flux), `transcribe` (4 whisper sizes, all local at $0).

---

## 5. The subsystems worth understanding

### Evidence floor — *does this deserve a video?*
The radar ranks 120 clusters and always produces a top row. That's what
relative ranking does — it crowns a winner even when nothing earned it. The
floor is **absolute**: a cluster is `corroborated` (2+ independent sources),
`spike` (3×+ its own source's baseline with real engagement), or `unproven`.
**Unproven is not promotable**, however high it ranks. "Nothing qualified
today" is a valid answer.

Entity grounding backs it: a miss on the label's head token costs ×0.25, so a
5,000-upvote post about something else loses to a 40-upvote post that's
actually on topic.

### Community quotes — *what people actually said*
Collectors originally captured only `title/url/points/comments`, so briefs were
written from **headlines alone** — which is why hooks came out generic. HN
discussions now attach to busy stories, and briefs receive verbatim,
per-commenter-attributed quotes. Press releases are down-ranked: a Vercel blog
post and a subreddit both arrive as RSS with zero points, so source *class* is
encoded explicitly. A line starting with `>` is dropped — that's the commenter
quoting someone else, and attributing it would fabricate a quote.

### Motion Lab — *22 effects, measured not guessed*
Effects are parameterised generators in
`renderers/code-report/src/effects/Effects.jsx` — **nothing is scraped** from
other creators. Each is rendered and measured with ffmpeg (opening energy,
motion energy, contrast, loop seam), and scored **against its role**: ambient
backgrounds want a motion *band*, hooks want opening energy, overlays refuse to
score solo. `compileBrief` attaches a per-scene effect hint automatically.

### Humanize — *stop sounding generated*
Adapted from Wikipedia's "Signs of AI writing", but **surface-aware**, because
a flat banlist would damage the output: rule-of-three and "Here's the thing"
are retention devices in a spoken hook; emoji are native to an IG caption.
24 patterns × 6 surfaces (`voiceover · title · description · caption · reply ·
post`), with some marked `native` (never flagged).

The project-specific part is **TTS safety**: an em dash in a voiceover field
isn't a style nit, it's a render bug — ElevenLabs turns it into an
unpredictable pause and every downstream word timestamp shifts. `compileBrief`
strips emoji/markdown/dashes from voiceover on every compile.

### Judge network — *5 gates*
`ideaJudge · scriptJudge · visualJudge · audioJudge · metadataJudge ·
thumbnailJudge`. Fails regenerate (max 3 attempts, $0.50 cap) then **escalate
to human review — nothing escalated ever auto-publishes**. Corrupt renders
hard-fail at 0 rather than squeaking through at threshold.

### Calibration + lessons — *the flywheel*
Published results are compared against predictions; judge critiques and real
outcomes distill into cited lessons that inject into generation. Prompt
versions change **only with your approval**. Currently starved: no published
posts to learn from.

---

## 6. Data model

JSON collections in `data/os/*.json` (no SQLite — no native modules on this
machine). Atomic writes, `.bak` on prune.

**31 collections.** The load-bearing ones:

| Collection | Holds |
|---|---|
| `trends` (`data/trends.json`) | 1000+ raw items with velocity snapshots, excerpts, comment voices |
| `clusters` | grouped topics + `scoreBreakdown` + `evidence` level |
| `briefs` | the plan for one video, all platforms |
| `publishitems` / `myposts` | staged → published, with real stats |
| `critiques` / `lessons` | judge feedback → distilled rules |
| `promptversions` | versioned prompts, human-approved |
| `effectbench` | measured effect scores |
| `quota` | YouTube unit spend per module per day |

---

## 7. Hard rules the system enforces

These are non-negotiable and deliberately hard to bypass:

- **Human review gate before publish.** `produce` refuses a brief that isn't
  approved (`brief is draft — approve it first`).
- **Private-first uploads** with synthetic-media disclosure set
  programmatically. `--go` required for any real upload; `--public` must be
  explicit. ≤2 uploads/day/platform.
- **Auto-publish needs two flags** — `PUBLISH_MODE=auto` **and**
  `YOUTUBE_APP_VERIFIED=true`. Meta needs `META_APP_REVIEWED=true`.
- **No Instagram/Facebook scraping.** Manual metric entry only. Permanent.
- **No YouTube downloader.** `longform` works on *your own* local footage —
  a downloader would be both a ToS violation and the reupload pattern the
  compliance layer exists to prevent.
- **No scraped designs.** Every Motion Lab effect is code we own.
- **No fabrication.** A humanize rewrite may never invent a fact, name, number
  or citation absent from the input. Quotes are verbatim or they aren't quotes.
- **No fake metrics.** No RPM/revenue estimates and no CTR/impressions claims —
  there's no legitimate data source for either.
- **Render determinism.** Animation is driven by frame number only. No
  `Date.now`, no `Math.random`, no rAF in the frame path, or distributed
  rendering tears.

---

## 8. Running it

```bash
node packages/cli/bin/factory.js radar collect     # 1. find topics
node packages/cli/bin/factory.js evidence report   # 2. what deserves a video
node packages/cli/bin/factory.js brief             # 3. write the plan
npm run dev --prefix apps/mission-control          # 4. approve at :4600/briefs
node packages/cli/bin/factory.js produce <briefId> # 5. make the video
```

Then `publish <id>` for a dry run, `publish <id> --go` for a real (private)
upload.

Health checks: `factory ai` (tiers + balance) · `factory health` (output
quality) · `factory humanize audit` (AI-writing tells) · `factory doctor`
(toolchain).

The portal at **http://localhost:4600** exposes all of it across 23 pages.

---

## 9. File map

```
packages/cli/       the `factory` command — 42 subcommands
packages/shared/    env, paths, config, JSON collection store
packages/llm/       4-tier AI router + chains
packages/radar/     collectors, clustering, evidence floor, quotes, keywords
packages/pipeline/  orchestrator, render, voice, autoedit, reframe, batch
packages/studio/    briefs, compileBrief, motionLab, humanize, nichePacks
packages/judges/    the 5 quality gates
packages/publish/   center, compliance, calibration, playbooks, YouTube
renderers/          code-report (Remotion) + effects/ · math (Manim)
apps/               Mission Control (Next.js, :4600)
data/               gitignored state — 31 JSON collections
renders/            gitignored MP4s · _motion/ = effect previews
```

**Boundary rule:** `render-engine/` and `extension/` are standalone — never
imported from `packages/`, never in the Vercel build.

---

## 10. Knowledge files

- **`lessons.md`** — 20+ entries of *tried → broke → rule*. Read before
  retrying anything that failed once; append after every surprise. This is the
  most valuable file in the repo.
- **`CLAUDE.md`** — architecture rules and hard constraints.
- **`README.md`** — feature reference.
- **`DEPLOY.md`** — deployment; its structure section drifts, update it when
  adding routes.
