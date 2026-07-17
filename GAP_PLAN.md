# GAP_PLAN — Content OS blueprint vs. this repo

Audit date: 2026-07-13 (post P0–P6 + AI Cut, commit 82bebda).
Rule: blueprint milestones run against THIS table. EXISTS = don't rebuild —
extend. Files are exact.

## Module audit

| Blueprint module (prompt) | Status | Where it lives / what's missing |
|---|---|---|
| Collectors: Reddit/HN/GitHub/RSS (P2) | **EXISTS** | `packages/radar/src/sources.js` (sequential Reddit + browser UA, per-source try/catch), `radar.js`. Missing vs spec: per-item Snapshots + velocity (Δscore/Δh) — extend `db.js`, don't replace |
| Velocity snapshots (P2.5) | **MISSING** | add snapshot append in `packages/radar/src/db.js` + velocity calc in `score.js` |
| YouTube radar: trending/niche heat (P3) | **MISSING** | new `packages/radar/src/youtube.js` — cached+batched client, quota ledger. Needs `YOUTUBE_API_KEY` (not in .env yet) |
| Watchlist channels + outlier ratios (P3) | **MISSING** | same module; store `data/os/watchlist.json` |
| saturation(topic) helper (P3) | **MISSING** | same module; feeds scorer |
| Clustering + opportunity score (P4) | **PARTIAL** | `packages/radar/src/score.js` scores single items (heuristic + LLM). Missing: LLM clustering into TopicClusters, 4-component breakdown (velocity/crossSource/nicheFit/saturationGap), rising/fading status |
| Wishlist analyzer (P5) | **MISSING** | new `packages/studio/src/wishlist.js` + portal page. IG/FB = manual-metrics form ONLY |
| Brief Studio (P6) | **MISSING** | new `packages/studio/src/briefs.js` — multi-platform payload (yt_short/ig_reel/carousel/linkedin/x/blog), timing_ist, manual_publish_checklist. Hook into existing `generate.js` style guide |
| Dashboard (P7) | **PARTIAL** | `apps/mission-control` has Trends/Scripts/Math/Footage/Renders/Analytics/Settings. Missing: Today (command center), Briefs, Wishlist, YouTube pages |
| Worker + cron (P8) | **MISSING** | new `packages/cli/src/worker.js` (`factory worker`), JobRun log to `data/os/jobruns.json` |
| Hardening/failure drills (P9) | **PARTIAL** | keyless degradation exists everywhere; YouTube-cap drill arrives with P3 |
| Publish Center, staged (P10) | **EXISTS (stronger)** | `packages/publish/*` — private-first, disclosure, compliance gate, ≤2/day, dry-run default. Missing vs spec: PublishItem queue per platform, Golden-60 toggle, MyPost tracking rows |
| Title & Hook Lab (P11) | **MISSING** | new `packages/studio/src/titleLab.js` + patterns store; feeds Brief Studio scores |
| Niche Explorer + Shorts outliers (P12) | **MISSING** | extends youtube.js; SEPARATE shorts vs long-form medians |
| Keyword Gap Finder (P13) | **MISSING** | autocomplete (fragile-by-design) + LLM expansion + saturation() |
| Idea Bank + Series Planner (P14) | **MISSING** | `data/os/ideabank.json` + ranking; "Make Next" card on Today |
| Calibration loop (P15) | **PARTIAL** | `packages/publish/src/analytics.js` pulls views/day + category weights. Missing: MyPost joins by hook/pillar/length/slot, weekly memo, guarded auto-tuning, prediction scorecard |
| Quota manager (P16) | **MISSING** | ledger + per-module allocator; Settings dashboard |
| Render engine (P17) | **EXISTS** | `renderers/code-report` (7 scene types, brand-tokened), `packages/pipeline/render.js`, voice w/ ElevenLabs word timestamps (NO whisper needed for generated voice — blueprint's whisper step is obsolete here), karaoke captions. Missing: RenderSpec-from-brief compiler, DataStory/SplitCompare/BeforeAfter comps |
| QC Judge network (P18) | **MISSING** | new `packages/judges/` — 5 judges, regen protocol (max 3, $ cap, escalation queue). VisualJudge needs a vision-capable provider |
| Lesson memory + prompt evolution (P19) | **MISSING** | `data/os/lessons.json` + injection into generation prompts; manual promotion only |
| Two-lane orchestrator (P20) | **PARTIAL** | capture lane EXISTS (`autoedit.js` = AI Cut). Missing: lane routing, synthetic zero-touch chain, kanban states |
| Thumbnail studio (P21) | **MISSING** | HTML-to-image templates + vision judge |
| Platform playbooks (P22) | **MISSING** | config + evidence-based monthly refresh |
| Full-auto dry run (P23) | **MISSING** | last |
| Format registry + fan-out + composers (P24) | **MISSING** | registry, CarouselRenderer, CommentMiner, Blog/Newsletter composers, syndication, 50-idea seed |

## Stack conflict resolutions (final)

| Blueprint default | This repo does instead | Why |
|---|---|---|
| TypeScript strict | plain JS | repo convention |
| Prisma + SQLite | JSON collections (`packages/shared/src/store.js`, data/os/*.json) | no native deps — lessons.md, better-sqlite3 incident |
| zod | `store.js` shape-validate helper | zero new deps |
| node-cron package | plain `setInterval` worker under `factory worker` | zero new deps, same effect |
| whisper on generated voice | ElevenLabs word timestamps directly | already solved better; whisper stays for CAPTURE footage only (AI Cut) |
| new Remotion package | extend `renderers/code-report` | EXISTS |

## Standing decisions

- Makeup channel: capture-only lane via AI Cut; excluded from Content OS
  intelligence/briefs (blueprint parks it; the auto-editor still serves it).
- Prerequisites tracked, not blocking: `YOUTUBE_API_KEY` (P3+ degrade
  keyless with a clear notice), LLM key (everything degrades already),
  YouTube API verification + Meta review = approval queues to start early —
  auto publish mode stays off until then.
- Build order (leverage-first, supersedes blueprint numbering):
  1. store.js foundation ✅ → 2. snapshots/velocity + clustering/score
  breakdown → 3. YouTube radar + saturation + watchlist → 4. Brief Studio →
  5. Today page + worker → 6. Publish Center queue + MyPost/Golden-60 →
  7. Title/Hook Lab → 8. Idea Bank → 9. Judges → 10. Calibration →
  11. Lessons → 12. fan-out/composers → 13. playbooks → 14. dry run.
