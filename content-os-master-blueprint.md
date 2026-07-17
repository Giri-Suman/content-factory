# CONTENT OS — MASTER BLUEPRINT (All Phases, One Document)

The complete prompt-by-prompt build plan for your all-in-one content intelligence, production, and self-improvement system — built on your existing Fable-5 baseline, driven through Claude Code.

**System summary:** trend mining (Reddit/HN/GitHub/RSS/YouTube) → opportunity scoring with saturation-gap detection → wishlist link autopsies → platform-specific briefs → competitor-parity intelligence (outliers, title/hook lab, niche explorer, keyword gaps, idea bank) → staged/auto publishing with Golden-60 → two-lane video production (Remotion + voice + captions) → five-judge QC network with regeneration → lesson memory, prompt evolution, and outcome calibration.

---

## HOW TO USE THIS DOCUMENT

1. Run the phases **strictly in order**: Phase 1 (P0–P9) → Phase 2 (P0.1, P10–P16) → Phase 3 (P17–P23). Every prompt assumes all previous acceptance checks passed.
2. **The spec deliberately evolves.** Phase 1's P0 excludes publishing; Phase 2's P0.1 patches that exclusion away and adds new modules. This is intentional sequencing, not a contradiction — always apply P0.1 before any P10+ work.
3. One prompt = one milestone. Let Claude Code finish → run the acceptance check → `git commit` → next prompt.
4. Paste real terminal errors verbatim. Drift correction phrase: "Re-read CLAUDE.md and GAP_PLAN.md and stay in scope."
5. Stuck >20 min on one bug → stub it behind an interface, log it as debt, keep moving.
6. Realistic total build: 8–12 focused days. Each phase ends independently usable.

## MASTER PHASE MAP

| Phase | Prompts | Delivers | Budget |
|---|---|---|---|
| 1 — Intelligence Core | P0–P9 | Collectors, velocity scoring, YouTube radar + watchlist outliers, saturation gap, wishlist analyzer, Brief Studio, dashboard, worker | 1–2 days |
| 2 — Parity + Publishing | P0.1, P10–P16 | Publish Center (staged/auto), Title & Hook Lab, Niche Explorer + Shorts outliers, Keyword Gap Finder, Idea Bank + Series Planner, Calibration Loop, Quota Manager | 3–5 days |
| 3 — Production + Self-Improvement | P17–P23 | Remotion render engine, voice + captions, QC Judge Network with regeneration, lesson memory + prompt evolution, two-lane orchestrator, thumbnail studio, platform playbooks, full-auto dry run | 4–6 days |

## PERMANENT GROUND TRUTHS (apply to every phase)

- Three platform walls exist and are approval queues, not code problems: Meta app review, YouTube API verification, Instagram's closed data. Staged publishing + manual-metrics entry are the designed, surviving workarounds. No evasion features, ever — evasion patterns are exactly what platforms demonetize.
- The human touchpoints (brief approval, capture-lane recording, publish tap + Golden 60, weekly review) are load-bearing: they are the originality shield and the quality moat. Target after Phase 3: ~40 min/day + two recording sessions/week.
- Virality is an outcome the system makes more likely, not a feature it guarantees. The calibration loop trained on YOUR results is the only honest predictor.
- When in doubt between adding a feature and posting a video: post the video.

---


<!-- ============================ PHASE 1 ============================ -->

# Content OS — Full Prompt Set v2 (Existing Project Edition, Manual Publishing)

Adapted for: you already have a baseline project, and you will publish manually (no publishing APIs anywhere in this build). Paste these into Claude Code in order. One prompt → acceptance check → commit → next.

---

## P0 — The Spec (paste FIRST, before anything else)

```text
You are extending my EXISTING project into "Content OS v1" — a content intelligence system for my coding + AI-automation creator brand. First task ONLY: write/update CLAUDE.md with this spec. Do not write feature code yet.

MISSION: A locally running app that (1) collects trend signals from multiple sources, (2) scores topic opportunities for MY niche, (3) analyzes wishlist video links I paste, (4) generates platform-specific content briefs with timing + a manual publish checklist, (5) refreshes itself automatically. I publish everything MANUALLY — there is NO publishing/upload integration in this system, ever. Do not add publishing APIs, OAuth for posting, or scheduler-poster code.

INTEGRATION RULE: This is an existing codebase. You must adapt to its stack, conventions, naming, and structure — not impose new ones. Where the spec below names a technology, treat it as a default to use ONLY if the project doesn't already have an equivalent.

DEFAULTS (only where the project lacks an equivalent): TypeScript strict, Prisma + SQLite, node-cron worker script, Anthropic SDK for LLM calls (model via env ANTHROPIC_MODEL, default a Sonnet-class model), YouTube Data API v3, zod for all LLM JSON validation.

DATA MODELS (adapt names to project conventions):
- Item: id, source, sourceType(reddit|hn|github|rss|youtube), externalId, title, url, author?, score, comments, publishedAt, fetchedAt, clusterId?, raw(Json)
- Snapshot: id, itemId, score, comments, capturedAt   // velocity = Δscore/Δhours
- TopicCluster: id, label, summary, opportunityScore, scoreBreakdown(Json), status(new|rising|fading), memberCount, updatedAt
- WatchChannel / WatchVideo: channel stats, per-video views/likes/comments, medianViews, outlierRatio
- WishlistEntry: id, platform(youtube|instagram|facebook), url, mode(api|manual), metrics(Json), contentAnalysis(Json), verdict(Json), predictedTier(S|A|B|C), createdAt
- Brief: id, topicClusterId?, wishlistEntryId?, kind(trend|evergreen), deadline?, payload(Json), status(draft|approved|killed), createdAt
- JobRun: job, startedAt, ok, error?

HARD CONSTRAINTS:
- All keys via .env (YOUTUBE_API_KEY, ANTHROPIC_API_KEY, ANTHROPIC_MODEL). Never hardcode.
- NO Instagram/Facebook scraping. IG/FB analysis = manual-metrics entry only. Do not add Meta scraping libraries.
- YouTube quota care: cache every YouTube API response 30 min in DB; batch video-detail calls (50 ids/call); daily unit cap via env (default 8000) — skip YouTube jobs beyond cap and surface a warning.
- Every LLM call: strict JSON out, zod-validated, one retry on parse failure, then graceful degradation. A failed LLM call must never crash a pipeline run.
- Every milestone ends with typecheck passing + a stated acceptance check.
- My niche context for ALL LLM prompts: senior front-end developer creating content on coding, AI automation, and AI tools, for developers + tech-curious freelancers, India + global English audience, timezone IST.

EXCLUSIONS (refuse scope creep, including from me mid-day): publishing/uploading of any kind, Remotion/video rendering, Whisper, embeddings, Meta APIs, auth/multi-user.

Write CLAUDE.md now (spec + build-order checklist P1→P9), then stop and wait.
```

**Accept:** CLAUDE.md matches. Commit `chore: content-os spec`.

---

## P1 — Codebase Audit + Gap Plan (replaces scaffolding)

```text
Milestone 1 — audit, don't build.

1. Read the existing codebase thoroughly: framework, folder conventions, DB/ORM, existing models, UI library, existing pages/routes, worker/cron setup if any, env handling.
2. Produce GAP_PLAN.md: a table mapping every CLAUDE.md module (collectors, snapshots/velocity, YouTube radar, scoring, wishlist analyzer, brief studio, dashboard pages, worker, settings) → EXISTS / PARTIAL / MISSING in this project, with the exact files you'll touch or create for each.
3. List any conflicts between the spec defaults and the project's actual stack, with your recommended resolution for each (always prefer the project's existing choices).
4. Add the six dashboard destinations to the plan using the project's routing conventions: Today, Trends, YouTube, Wishlist, Briefs, Settings.
5. Run the DB migration for any missing models ONLY. No feature code yet.

Acceptance: GAP_PLAN.md exists and is accurate (I will spot-check it), migrations run clean, typecheck passes, app still boots exactly as before.
```

**Accept:** plan is accurate, nothing broken. Commit.

---

## P2 — Collectors (Reddit / HN / GitHub / RSS)

```text
Milestone 2 — ingestion collectors per GAP_PLAN. One module per source, each exposing collect(): Promise<NormalizedItem[]>, orchestrated with per-collector try/catch (one failure never kills the run).

1. Reddit: for each configured sub fetch https://www.reddit.com/r/{sub}/hot.json?limit=25 with User-Agent "content-os/1.0". Map externalId=name, score=ups, comments=num_comments, publishedAt from created_utc. Seed subs: webdev, reactjs, programming, artificial, LocalLLaMA, automation, SideProject.
2. Hacker News (Algolia): front page (tags=front_page) + top "AI" stories last 24h (search_by_date + numericFilters). Map points/num_comments.
3. GitHub Trending: fetch https://github.com/trending?since=daily, parse repo/description/stars/language with cheerio. Fragile-by-design: try/catch, log-and-skip on layout change.
4. RSS (rss-parser): seed feeds = OpenAI blog, Anthropic news, Vercel blog, GitHub blog. score=0 (velocity comes from cross-source confirmation for RSS).
5. Ingest/upsert: dedupe by (source, externalId) AND normalized URL. Every run writes a Snapshot per item; velocity = (latest−previous score)/hours; first sighting → null.
6. All source lists + scoring weights live in one editable config (file or table, per project convention). CLI/script `collect` prints: source | fetched | new | updated | errors.

Acceptance: run collect twice ~2 min apart → velocities computed on second run; summary table prints; one deliberately broken feed URL does not stop the others.
```

---

## P3 — YouTube Radar

```text
Milestone 3 — YouTube module with a cached, batched API client (30-min DB cache, 50-id batching, unit counter).

1. Trending: videos.list chart=mostPopular, regionCode IN and US, videoCategoryId 28 (Sci&Tech) and 27 (Education), 25 each → Items (sourceType youtube, score=viewCount).
2. Niche heat: for each configured keyword ("ai automation", "claude code", "cursor ai", "n8n workflow", "python automation", "ai agents"), search.list publishedAfter=now-48h order=viewCount max 10 → one batched videos.list for stats → Items.
3. Watchlist: addChannel(urlOrHandle) resolves channelId (channels.list forHandle/forUsername/id), stores title + subscriberCount; pulls last 25 uploads (uploads playlist → playlistItems → batched videos.list); medianViews = median(25); outlierRatio per video = views/medianViews.
4. Outlier alert query: outlierRatio ≥ 3 within last 14 days.
5. saturation(topicPhrase) helper for the scorer: search.list last 48h → {videoCount, medianViews}; cached 30 min; called only for top-15 clusters per scoring run.
6. YouTube page: tabs Trending | Niche Heat | Watchlist; watchlist cards show outlier badges like "4.2x".

Acceptance: all three tabs live; I add 2 channels by handle and see outlier ratios; print estimated quota units per full cycle (must be < 1,500).
```

---

## P4 — Scoring Engine

```text
Milestone 4 — Opportunity Score, runnable as `score` and auto-run after collect.

1. Clustering (pragmatic, no embeddings): top 120 Items by recency+score → ONE LLM call → strict JSON clusters {label, summary, memberExternalIds[]}; ungrouped items stay singletons; persist TopicClusters + clusterId backrefs.
2. scoreBreakdown per cluster:
   - velocity (0–40): max member velocity normalized vs that source's 7-day median baseline (fallback constants until 7 days of data exist).
   - crossSource (0–25): distinct sourceTypes → 1=5, 2=15, 3+=25.
   - nicheFit (0–20): LLM 0–10 vs my niche context, ×2 — ALL clusters rated in one batched call.
   - saturationGap (0–15): high external demand + low recent YouTube supply (few videos / low medianViews last 48h) = high; flooded = low. Top-15 only; others default 7.
3. opportunityScore = sum. status: new / rising (score ↑ vs last run) / fading (↓ two consecutive runs).
4. Trends page: ranked cluster cards, expandable score breakdown (no black boxes), member links, status badges, "Generate Briefs" button (stub).

Acceptance: collect + score → ranked Trends page where every score expands into its exact components.
```

---

## P5 — Wishlist Analyzer

```text
Milestone 5 — Wishlist Analyzer page + analysis lib.

FLOW A — YouTube URL:
1. Parse videoId → videos.list (snippet, statistics, contentDetails) + channel stats + channel's last 25 uploads → channelMedianViews.
2. Compute outlierRatio, engagementRate ((likes+comments)/views), viewsPerHour, durationSec.
3. Tracking: snapshot metrics now; worker re-polls tracked entries hourly for 48h → velocity curve stored in metrics.
4. ONE LLM call (strict JSON): classify title against the 9 hook patterns [Identity Call, Contrarian Strike, Open Loop, Confession, Results First, Mistake Warning, List Tease, Direct Question, POV/Relatable]; infer topic; title specificity 0–10; whyItWorked (3 bullets); stealThis (adaptation for MY niche per CLAUDE.md).
5. Verdict card with predictedTier S/A/B/C from a transparent coded rubric (e.g., outlierRatio≥3 && engagement ≥ channel norm → S; document the rubric in comments). Persist predictedTier — it feeds future calibration.

FLOW B — Instagram/Facebook URL (manual mode, NO scraping):
1. Form: url + views, likes, comments, shares?, hoursSincePost, creatorFollowerCount + optional caption paste + optional "describe the first 3 seconds" field.
2. Compute viewsPerFollower, engagementRate, viewsPerHour.
3. Same LLM structural analysis on caption/description → same verdict card, clearly badged "manual mode".

Wishlist page: verdict cards sortable by tier, tracking badge for live-polled YT entries, delete.

Acceptance: 2 YouTube links → full autopsies with tiers + stealThis; 1 IG manual entry → verdict card; tracked entries update on next worker cycle.
```

---

## P6 — Brief Studio (with Manual Publish Checklist)

```text
Milestone 6 — Brief Studio: "Generate Briefs" works from any TopicCluster or WishlistEntry.

One LLM call (strict JSON, zod-validated), inputs = my niche context + cluster/wishlist analysis, output payload:
{
  kind: "trend" | "evergreen",
  deadline: ISO | null,               // trend → within 24h
  core_idea: string,
  yt_short: { hook_variants: [3], beats: string[], length_sec: 25–40, title, description (keyword-rich 2 lines), tags[] },
  ig_reel: { script_adjustments, caption (conversational, ends with a question), hashtags[] (≤8, niche-specific) },
  ig_carousel: { slides: [7 short strings], cover_text },
  linkedin: { post_text (all value native, NO external links, inline code snippet if relevant) },
  x_thread: [3 strings],
  blog_outline: { title, quick_answer (2 sentences), h2_sections[], original_data_angle },
  platform_adjustments: string[],     // concrete diffs per platform, e.g. "YT: open on the terminal error; IG: open on the payoff number; LinkedIn: frame as a team-cost lesson"
  timing_ist: { yt, ig, linkedin, x, rationale },
  manual_publish_checklist: string[]  // ordered steps for ME to post by hand, e.g. "1. Upload Short natively 19:00–21:00 IST, paste title+desc from above. 2. Post Reel in-app; consider Trial Reel toggle; add native trending audio at low volume under voiceover if it fits. 3. Reply to every comment in the first 60 min. 4. LinkedIn next morning 10:00 IST, text native. 5. X thread 09:30 IST."
}
Timing defaults to encode: trend → all platforms same day (yt 19:00–21:00, ig 12:30 or 20:30, linkedin 10:00 weekday, x 09:30, all IST); evergreen → next free daily slot (one short/day queue). The rationale must state these are public-research defaults that my own analytics will override after 3–4 weeks.

Briefs page: cards by status; per-platform tabs; inline-edit hooks/captions; Approve / Kill; trend briefs show a deadline countdown chip; approved briefs render the manual_publish_checklist as tickable checkboxes (state persisted).

Acceptance: generate from my #1 cluster AND from one wishlist entry; edit a hook; approve one (checklist becomes tickable); kill one.
```

---

## P7 — Dashboard Wiring

```text
Milestone 7 — Today page as the daily command center, everything wired.

Today: Top-10 Opportunities (one-click Generate Briefs) • Rising-fast strip (biggest deltas) • Watchlist outliers this week • Briefs awaiting approval with deadline chips • Approved-but-unposted briefs with their checklists ("To Post Today") • last-updated timestamp + "Refresh now" (server-side collect+score with progress feedback).
Settings: edit sources/keywords/weights via UI (effective next run) • quota-used-today estimate • JobRun log table at the bottom.
Empty states with the fixing action, loading skeletons, phone-usable layout.

Acceptance: cold start → approved brief with visible publish checklist in under 3 minutes, using only the UI.
```

---

## P8 — Worker + Realtime Refresh

```text
Milestone 8 — long-running worker (node-cron or project equivalent):

- every 30 min: collect (Reddit/HN/RSS) → score
- every 60 min: YouTube trending + niche heat; wishlist tracking re-polls
- every 6 h: GitHub trending; watchlist refresh + outlier recompute
- daily 08:00 IST: Morning Digest record (top 10 + overnight risers + outliers + today's unposted checklist) → banner on Today
- all jobs: try/catch + JobRun logging; the Today timestamp updates without manual reload (poll/revalidate per project convention)

Acceptance: two full cycles observed live; JobRun fills; timestamp self-updates.
```

---

## P9 — Hardening + Ship

```text
Milestone 9 — ship.

1. Failure drills: remove YOUTUBE_API_KEY → app runs, YouTube sections show a clear "check API key" state. Remove ANTHROPIC_API_KEY → collectors still run, scoring/briefs degrade gracefully with a visible notice. Restore.
2. Verify the YouTube daily unit cap works (set cap to a tiny number, watch jobs skip with a warning, restore).
3. README section for Content OS: setup, env, commands, mermaid architecture diagram, and a Day roadmap: Remotion production line, Whisper captions, prediction calibration (predictedTier vs actual 48h results once ~20 posts exist), timing self-tuning from my own analytics.
4. Full E2E with me: fresh collect+score → add watchlist channel → analyze 1 wishlist link → generate + approve 1 brief → tick a checklist item → worker cycle.
5. Tag the release.

Then print: one-paragraph summary of what was built + the top 3 technical debts to address first.
```

---

## Standing Rules (keep visible all day)

1. One prompt = one milestone. Acceptance check → commit → next.
2. Paste real errors verbatim; never paraphrase them.
3. Drift correction phrase: "Re-read CLAUDE.md and GAP_PLAN.md and stay in scope."
4. Stuck >20 min on one bug → stub it behind an interface, keep the loop shippable, note it in README debts.
5. Any suggestion to add publishing, scraping Meta, or new heavy dependencies → the answer is no (it's in the spec's exclusions).


<!-- ============================ PHASE 2 ============================ -->

# Content OS — Phase 2 Prompt Pack (All-In-One Edition)

Prerequisite: P0–P9 from the v2 prompt set are DONE and working. This pack upgrades the system to competitor parity + staged auto-posting + self-calibration. Run in order. Same standing rules: one prompt → acceptance → commit.

Realistic budget: 3–5 focused days. Each milestone ships something usable on its own.

---

## P0.1 — Spec Patch (paste first)

```text
Update CLAUDE.md — the spec is changing. Apply these edits, then stop:

1. REMOVE the "no publishing" exclusion. ADD module: Publishing Pipeline with two modes:
   - staged (DEFAULT): system prepares everything (video file slot, title, description, tags, thumbnail, target time); a human taps Publish per platform in the Publish Center. YouTube uploads may go up as private/unlisted drafts where the API allows; the human flips them live.
   - auto (env flag PUBLISH_MODE=auto, ships OFF): fully hands-off, only enabled after our YouTube API project passes Google's verification/audit and the Meta app passes review. The code must check the flag at runtime; staged is always the fallback.
2. ADD modules: Title & Hook Lab, Niche Explorer, Keyword Gap Finder, Idea Bank & Series Planner, Calibration Loop, Quota Budget Manager, My Channel analytics ingestion.
3. ADD models:
   - TitlePattern: id, template, exampleTitles(Json), avgOutlierRatio, sampleSize, updatedAt
   - IdeaBankEntry: id, briefId?, title, pillar, effort(S|M|L), status(backlog|scheduled|made|retired), score, createdAt
   - PublishItem: id, briefId, platform, mode(staged|auto), assets(Json), scheduledFor, publishedAt?, externalUrl?, status(preparing|ready|published|failed), golden60Done(bool)
   - MyPost: id, publishItemId?, platform, externalId, postedAt, hookPattern, pillar, lengthSec, title, statsSnapshots(Json)
   - QuotaLedger: id, date, endpoint, units, job
4. ADD hard rule: every YouTube API call must log to QuotaLedger with true unit costs (search.list=100, videos/channels/playlistItems=1, videos.insert=1600). Jobs must consult a daily budget allocator before running.
5. ADD explicit non-goals (permanent): niche-wide multi-million-channel crawling, RPM/revenue keyword estimates (no legitimate data source), thumbnail similarity search, automated IG/FB metric scraping. If I ask for these later, remind me they are excluded and why.

Show me the CLAUDE.md diff, then wait.
```

**Accept:** diff is exactly this. Commit.

---

## P10 — Publishing Pipeline + Publish Center (staged-first)

```text
Milestone 10 — Publishing.

1. PublishItem lifecycle: an approved Brief can "Send to Publish Center" → creates PublishItems per platform with assets prefilled from the brief payload (title, description, tags, caption, hashtags, thread text) + a file-drop slot for the finished video/thumbnail + scheduledFor from timing_ist.
2. YouTube (staged): integrate videos.insert (resumable upload) + thumbnails.set behind our OAuth flow for MY channel only. Default behavior: upload as unlisted/private draft with all metadata set and (where available) publishAt scheduling; PublishItem becomes "ready" with a deep link to the video in Studio for the final flip. If PUBLISH_MODE=auto AND an env ack YOUTUBE_APP_VERIFIED=true, set privacy public/scheduled directly.
3. Instagram/Facebook: implement the Graph API container flow (create media container → publish) behind env flags META_APP_REVIEWED=true; until then the PublishItem renders the manual checklist from the brief instead, with a copy-all button for caption+hashtags.
4. X + LinkedIn: no API integration; PublishItems render copy-ready text with a copy button and the target time.
5. Publish Center page: today's queue ordered by scheduledFor, per-item status chips, one-tap Publish (executes the API step or marks manual step done), and a "Golden 60" toggle per published item — after publishing, show a 60-minute countdown reminding me to reply to comments; ticking it sets golden60Done.
6. On successful publish (any mode), create a MyPost row linked back to the brief metadata (hookPattern from the chosen hook variant, pillar, lengthSec, title).

Acceptance: approve a brief → Publish Center shows the queue → I attach a dummy video file → YouTube staged upload completes as a draft with metadata visible in Studio → MyPost row exists after I mark it published.
```

---

## P11 — Title & Hook Lab (TubeLab/OutlierKit parity)

```text
Milestone 11 — Title & Hook Lab.

1. Pattern extraction: nightly job takes all WatchVideos + wishlist entries with outlierRatio ≥ 2, batches their titles to the LLM → strict JSON list of reusable title templates (e.g. "I {did extreme thing} so you don't have to", "{Tool} is {contrarian claim} — here's proof"), each with exampleTitles, sampleSize, avgOutlierRatio of its examples. Upsert TitlePatterns; merge near-duplicates.
2. Title scorer: input any draft title → returns (a) closest matching patterns with their avgOutlierRatio, (b) LLM sub-scores 0–10 for specificity, curiosity gap, identity-call strength, and a rewrite suggestion per weak sub-score. Wire this into Brief Studio: every generated yt_short.title auto-shows its score; inline "improve" button re-rolls with the scorer feedback.
3. Hook strength analyzer: same treatment for the 3 hook_variants in every brief — classify against the 9 hook patterns, score 0–10, flag generic openers ("wait for it", "you won't believe") as auto-fail with rewrites.
4. Lab page: browsable TitlePatterns table sorted by avgOutlierRatio (min sampleSize 3), search, and a free-form "score my title / hook" box.

Acceptance: patterns table populates from existing watchlist data; scoring a deliberately generic title returns low scores + concrete rewrites; new briefs display title/hook scores inline.
```

---

## P12 — Niche Explorer + Shorts Outliers (1of10-lite, quota-aware)

```text
Milestone 12 — Niche Explorer.

1. Channel discovery: from any seed channel or keyword, run a budgeted discovery pass (search.list type=channel + channels.list stats; hard cap 5 search units-of-100 per pass) → candidate channels ranked by relevance (LLM vs my niche context) × size-fit (10K–2M subs sweet spot) × recent-upload activity. One-click "add to watchlist".
2. Watchlist scaling: support 300 channels comfortably — refresh in rotating cohorts (each channel refreshed every 24h, spread across the 6h job) so daily cost stays ~2 units/channel. Show projected daily units on Settings.
3. Shorts outliers view: detect shorts (durationSec ≤ 61 via contentDetails) and compute outlierRatio against the channel's SHORTS median separately from long-form median (mixing them poisons both baselines). YouTube page gets a Shorts Outliers tab: niche-wide shorts ≥3x, sortable, each with "Analyze" (sends straight into the Wishlist Analyzer) and "Brief it" buttons.
4. Niche map card: weekly LLM summary over watchlist data — which topics/formats are rising across MY niche channels, which are fading, where the gaps are.

Acceptance: discovery from one seed suggests ≥10 relevant channels; shorts and long-form baselines are separated (show me one channel where the two medians differ); Shorts Outliers tab live; Settings shows quota projection under budget.
```

---

## P13 — Keyword Gap Finder (honest edition)

```text
Milestone 13 — Keyword Gap Finder.

1. Suggestion mining: expand each seed keyword via the public YouTube autocomplete endpoint (suggestqueries; mark this integration fragile-by-design with graceful failure) + LLM expansion (questions, comparisons, "X vs Y", "how to X" variants for my niche).
2. For each candidate keyword (budgeted: top 20/day by LLM-estimated relevance), compute a Demand-vs-Supply card: supply = saturation() (videoCount + medianViews last 48h, plus top-result recency and channel sizes — small channels ranking = soft competition); demand proxy = presence in autocomplete + appearance in collected Reddit/HN items (cross-reference the Items table).
3. Output: Opportunity Keywords list — high demand-proxy, weak supply — each with a one-click "Brief it".
4. Honesty constraints in UI copy: label demand as "proxy signals" (we have no search-volume API) and DO NOT show revenue/RPM estimates anywhere.

Acceptance: from my 6 seed keywords I get a ranked opportunity list with visible supply/demand reasoning; one click produces a brief; total daily quota for this module ≤ 2,200 units and visible in the ledger.
```

---

## P14 — Idea Bank + Series Planner (Spotter parity)

```text
Milestone 14 — Idea Bank.

1. Every approved brief auto-enters the IdeaBank (status backlog) with pillar tag (build|tool-verdict|explainer|news-take) and an LLM effort estimate (S ≤2h, M ≤1 day, L >1 day).
2. "What to make next" ranking = opportunityScore × pillar balance (penalize whatever I've overposted in the last 14 days, from MyPost data) × effort fit (I set available hours per week in Settings) × freshness decay for trend-kind ideas past deadline.
3. Series planner: group ideas into named series ("Automation Autopsies", "Day X of building Content OS"); a series view shows episode order and gaps; briefs generated from a series inherit its numbering and continuity notes.
4. Dedupe guard: before any new brief is created, similarity-check against existing IdeaBank titles (LLM batch) — warn on near-duplicates with a link to the prior idea.
5. Today page gets a "Make Next" card: top 3 ranked ideas with effort chips.

Acceptance: bank fills from existing approved briefs; ranking visibly changes when I flip pillar history or available hours; duplicate submission triggers the warning.
```

---

## P15 — Calibration Loop (the moat none of the tools have)

```text
Milestone 15 — Calibration.

1. My-channel ingestion: nightly job pulls stats for every MyPost (views, likes, comments) via videos.list on my own uploads (1 unit each) and appends to statsSnapshots → velocity curves at 1h/6h/24h/48h/7d marks where data exists.
2. Performance joins: each MyPost already carries hookPattern, pillar, lengthSec, postedAt slot, topic cluster. Build the analysis views: performance by hook pattern, by pillar, by length band, by posted time slot, by topic cluster.
3. Weekly memo (LLM, from the joined data only — no invented numbers): what outperformed my median, what underperformed, which of the system's assumptions look wrong, 3 concrete recommendations. Rendered on Today every Monday 08:00 IST.
4. Auto-tuning with guardrails: once N ≥ 20 MyPosts exist, (a) re-rank timing_ist defaults from my actual slot performance, (b) nudge scoring weights (max ±10% per week) toward what correlates with MY results, (c) feed the Title Lab my own winners as patterns. Every auto-change is logged and reversible from Settings.
5. Prediction scorecard: join Wishlist predictedTier and Brief title-scores against actual outcomes where I made the content — show calibration accuracy honestly, including "not enough data yet" states.

Acceptance: with seeded fake MyPost data (create a seed script for 25 posts), the memo generates, timing re-ranks, weight nudges log correctly, and the scorecard renders honest small-sample warnings.
```

---

## P16 — Quota Budget Manager + Ops

```text
Milestone 16 — make it run forever.

1. QuotaLedger enforcement everywhere: a central allocator grants daily budgets per module (defaults: watchlist 800, trending 200, niche heat 600, keyword gap 2,200, discovery 500, wishlist tracking 300, my-channel 100, reserve 1,000; publishing draws from reserve at 1,600/upload) — jobs degrade gracefully (skip + surface warning) when exhausted, never silently fail.
2. Settings: live quota dashboard (used/remaining per module), PUBLISH_MODE and verification flags, auto-tune on/off, backup button (SQLite export + config).
3. Failure drills rerun: kill each key, exhaust a budget artificially, break one collector — app stays up with clear states everywhere.
4. README final update: full architecture diagram, module map vs the competitor tools each replaces (1of10/TubeLab → Watchlist+Shorts Outliers+Title Lab; OutlierKit → Hook Lab+Keyword Gap; Spotter → Idea Bank; Octupie → Wishlist manual mode; none → Saturation Gap + Calibration), and the ops runbook.
5. Tag v2.0.

Then print: what exists now end-to-end, and the single highest-leverage thing I should do next as a CREATOR (not as a developer).
```

---

## Execution Order & Expectations

-  1: P0.1 + P10 (publishing) — you can stage and one-tap publish tonight.
-  2: P11 + P12 — title/hook intelligence + niche explorer.
- 3: P13 + P14 — keywords + idea bank.
- 4: P15 — calibration (seeded now, real once you've posted ~20 times).
- 5: P16 — ops hardening.
- In parallel from Day 1: YouTube API verification request + Meta app review are ticking. Auto mode flips on when they clear — zero code changes needed.

## The Permanent Truths (also encoded in the spec)

1. The system multiplies at-bats and catches gaps early; virality remains an outcome. Your calibration loop is the only "virality predictor" that will ever be honest — because it's trained on you.
2. Staged publishing + Golden 60 is not a downgrade from auto — the first hour of comment replies is a ranking input no API can fake.
3. When in doubt between adding a feature and posting a video: post the video. The system already exists to serve that choice.


<!-- ============================ PHASE 3 ============================ -->

# Content OS — Phase 3 Prompt Pack (Production + Self-Improvement Edition)

Prerequisite: Phase 1 (P0–P9) and Phase 2 (P0.1, P10–P16) complete. This phase adds: automated video production (two lanes), the QC Judge Network with regeneration, lesson memory + prompt evolution (true self-improvement), thumbnail studio, and platform playbooks. Budget: 4–6 focused days.

Same standing rules. One prompt → acceptance → commit.

---

## MASTER PHASE MAP (for orientation)

- **Phase 1 — Intelligence Core** (done): collectors, scoring, saturation gap, wishlist analyzer, briefs, dashboard, worker.
- **Phase 2 — Parity + Publishing** (done): Publish Center, Title/Hook Lab, Niche Explorer, Keyword Gap, Idea Bank, Calibration, Quota Manager.
- **Phase 3 — Production + Self-Improvement** (this pack): P17 render engine → P18 QC judges → P19 lesson memory → P20 orchestrator → P21 thumbnails → P22 platform playbooks → P23 full-auto dry run.

---

## P17 — Production Engine Core (Remotion + Voice + Captions)

```text
Milestone 17 — the render engine. Add a Remotion package to the repo (its own workspace/folder per project conventions).

1. Scene schema: define a zod-validated RenderSpec JSON — { compositionId, platformProfile, durationSec, voiceScript, scenes: [{type, props, startSec, endSec}] } — that fully describes a video. Briefs will compile into RenderSpecs.
2. Composition library (React/Remotion, all brand-tokened from one theme file — colors, fonts, logo bug, caption style):
   - CodeTyping: code auto-types with syntax highlight, cursor, configurable speed, zoom-punch on marked lines
   - KineticCanvas: hypnotic SVG/particle top layer + terminal/code lower layer
   - DataStory: animated charts (bar race, line reveal, big-number punch) from data props
   - ListicleCards: N-item card stack with icons and kinetic text
   - NewsTake: headline card + screenshot pan + big verdict text
   - HookFrame: the first-2-seconds composition — largest text, highest contrast, payoff visual
3. Platform profiles (config, not code): yt_short {1080x1920, 30fps, ≤40s, caption safe-zone bottom 25%}, ig_reel {1080x1920, cover-frame export at t=0, safe zones for UI chrome}, linkedin {1080x1350 option}, x {1080x1080 option}. Same RenderSpec renders to any profile.
4. Voice: ElevenLabs API integration (env key) — voiceScript → mp3; store voice settings in theme. Fallback: silent render + TODO marker if key missing.
5. Captions: transcribe the generated voice mp3 with whisper (local sidecar or API per project convention) → word-level timestamps → burned-in captions via a Caption component (grouped 2–4 words, active-word highlight).
6. Assembly: render pipeline job = RenderSpec → Remotion render → mux voice via ffmpeg → loudness normalize (ffmpeg loudnorm) → output mp4 + cover png per platform profile → attach to the brief's PublishItems automatically.
7. CLI: `render <briefId>` runs the whole chain; renders queue through the worker with concurrency 1.

Acceptance: one seeded RenderSpec renders a complete 30s video with voice + synced captions in all platform profiles; files land on the correct PublishItems; a missing ElevenLabs key degrades gracefully.
```

---

## P18 — QC Judge Network (review everything, regenerate on failure)

```text
Milestone 18 — the Judge Network. Every artifact passes a judge before advancing. Add models: Critique {id, artifactType, artifactId, judge, score, verdict(pass|fail), reasons(Json), attempt, createdAt}.

Judges (each = one cheap-model LLM call with a strict rubric returning {score 0–100, verdict, reasons[], fixInstructions}) — thresholds in config:
1. IdeaJudge (threshold 70): niche fit, novelty vs IdeaBank (inject nearest neighbors), hook potential, "would my target viewer stop scrolling" — judges every cluster→idea before briefing.
2. ScriptJudge (75): hook lands ≤2s, one-idea-per-video clarity, concrete payoff, banned-phrase check (generic openers list), pacing (a beat change every ≤5s of script), platform length fit.
3. MetadataJudge (75): title scored via Title Lab (reuse P11 scorer, don't duplicate), description keyword coverage without stuffing, tags/hashtags niche-specific not generic, policy red flags (misleading claims, clickbait mismatch with script).
4. VisualJudge (70, vision model): sample 6 frames from the rendered mp4 (ffmpeg -vf fps) including t=0 → check caption readability, contrast, text overflow/safe zones, brand consistency, hook-frame strength at t=0.
5. AudioJudge (programmatic, no LLM): duration matches spec ±10%, no silence gap >1.5s (ffmpeg silencedetect), loudness within target LUFS.

Regeneration protocol (generic, one implementation for all judges):
- fail → regenerate the artifact with the judge's fixInstructions injected into the generation prompt → re-judge. Max 3 attempts.
- 3 fails → status "escalated", lands in a Human Review queue on the dashboard with all critiques attached. NEVER auto-publish an escalated artifact.
- every attempt + critique persisted (this is training data for P19).
- cost guard: per-video judge+regen budget in config (default $0.50); exceeded → escalate instead of retrying.

Wire into the flow: idea→brief→script→metadata→render→visual/audio, judged at each hop. Dashboard: a QC page showing pass rates per judge, recent failures with reasons, escalation queue.

Acceptance: run 3 briefs end-to-end; deliberately sabotage one script (generic hook) and one render (tiny caption font) → correct judges fail them with specific reasons → regeneration fixes at least one automatically → pass rates visible on the QC page.
```

---

## P19 — Lesson Memory + Prompt Evolution (true self-improvement)

```text
Milestone 19 — the system learns from its mistakes. Add models: Lesson {id, scope(idea|script|metadata|visual|timing|topic), text, evidenceCount, weight, active, createdAt}, PromptVersion {id, task, version, template, createdAt, retired}.

1. Lesson distillation (weekly job): feed ALL Critiques + calibration outcomes (P15 joins) from the window to the LLM → distill into ≤10 new/updated candidate lessons per scope, each with evidence counts ("hooks phrased as questions underperformed my median 6/7 times", "VisualJudge failed 4 renders for caption overflow on ig_reel"). Merge with existing lessons (increment evidenceCount) rather than duplicating.
2. Lesson injection: every generation prompt (ideas, scripts, metadata, RenderSpec compilation) automatically includes the top-K active lessons for its scope, ranked by weight = evidenceCount × recency. This closes the loop: yesterday's failure reasons are tomorrow's prompt constraints.
3. Guardrails: lessons cap at K=8 per prompt; a lesson auto-deactivates if evidence stops accruing for 60 days; I can pin/kill any lesson from a Lessons page; lessons must cite their evidence (clickable to the critiques/posts behind them) — no vibes-based lessons.
4. Prompt evolution: version every major generation prompt. When calibration (P15) has ≥10 MyPosts per version, compare outcome medians between versions; the weekly memo may PROPOSE a new version (diff shown); I approve promotions manually — the system never silently rewrites its own prompts.
5. Self-improvement dashboard card: lessons learned this month, judge pass-rate trend (should rise), regen-rate trend (should fall), prompt versions in play.

Acceptance: seed 30 fake critiques → distillation produces sensible cited lessons → new script generation visibly includes them → pass-rate/regen-rate charts render → prompt promotion flow works with my manual approve.
```

---

## P20 — Two-Lane Orchestrator (brief → published, minimal hands)

```text
Milestone 20 — the conveyor belt. 

1. Lane routing: each brief gets lane = synthetic | capture, decided by format (explainers, verdicts, data stories, news-takes, listicles → synthetic; build/tutorial with real screen work → capture). LLM proposes, I can override at approve time.
2. Synthetic lane (zero-touch): approved brief → ScriptJudge-passed script → RenderSpec compilation (LLM maps script beats to compositions) → render → judges → PublishItems ready in Publish Center. No human step between approve and publish-tap.
3. Capture lane (assist mode): approved brief → shot list + talking-track generated → I record (OBS) and drop the file on the brief → auto-pipeline: silence-cut (ffmpeg silencedetect + concat), speed-ramp dead sections 1.5x, voice loudness normalize, captions, hook-frame prepend from HookFrame composition, platform crops → judges → Publish Center.
4. Pipeline state machine per brief: approved → scripted → rendered/awaiting-capture → qc → ready → published, visible as a kanban on a Production page with stuck-item alerts (anything >24h in a state, or >6h for trend-kind).
5. Throughput target encoded: worker paces the synthetic lane to my configured cadence (default 1/day) and warns me when the Idea Bank's "Make Next" top item is capture-lane and unrecorded for 3 days.

Acceptance: one synthetic brief goes approve→ready with zero touches; one capture brief goes ready after I drop a dummy screen recording; kanban reflects every state change; a trend brief stuck >6h raises an alert.
```

---

## P21 — Thumbnail & Packaging Studio

```text
Milestone 21 — packaging.

1. Thumbnail generation (long-form + cover frames): HTML-to-image templates (3 brand layouts: BigNumber, FacelessSplit, BeforeAfter) driven by brief payload; optional image-gen API background behind env flag; always ≥2 variants per video.
2. Thumbnail judge (vision): legibility at 120px width (render a downscaled check), contrast, ≤4 words, no overflow — same regenerate/escalate protocol.
3. YouTube: upload variant A via thumbnails.set at publish; store variant B; honest note in UI — native Test & Compare is Studio-only, so the checklist includes "add variant B in Studio A/B" OR enable timed-swap fallback (swap to B after 72h if CTR proxy — views/impressions unavailable via API, so use views-vs-channel-median — underperforms; config off by default).
4. IG cover frame: export the strongest frame (VisualJudge picks from 6 samples) as the Reel cover; attach to PublishItem assets.
5. SEO pack completeness check: every PublishItem must carry platform-complete metadata (yt: title/desc/tags/thumb; ig: caption/hashtags/cover; linkedin: post text; x: thread) — MetadataJudge blocks "ready" status otherwise.

Acceptance: a rendered brief produces 2 judged thumbnail variants + IG cover; PublishItems refuse ready-status with incomplete metadata; the Studio A/B step appears in the publish checklist.
```

---

## P22 — Platform Playbooks (algo intelligence, honestly sourced)

```text
Milestone 22 — platform-specific intelligence that stays current WITHOUT pretending to see private algorithms.

1. PlaybookConfig per platform (yt_short, ig_reel, linkedin, x): optimal length band, hook style weighting, caption/hashtag rules, posting slots, format notes. Seed from our current defaults.
2. Evidence-based refresh (monthly job): re-derive each playbook from three real sources — (a) MY MyPost outcomes by platform (P15 joins), (b) watchlist outlier patterns by platform (shorts vs long, lengths, title patterns), (c) collected Items mentioning platform changes (Reddit/HN chatter about algorithm/policy updates → surfaced as "unverified signals" for my manual review, never auto-applied).
3. Proposed playbook changes render as diffs with evidence links; I approve/reject; approved changes propagate automatically into brief generation, RenderSpec profiles, and timing defaults.
4. A Playbook page shows current rules per platform + change history + evidence.
5. Hard honesty rule in code comments and UI: playbooks derive from observed outcomes, not platform internals; "unverified signals" stay quarantined until human-approved.

Acceptance: playbooks render with seeded rules; a fake strong signal in MyPost data (seed: 35s videos outperform) generates a proposed diff with evidence; approving it changes the next brief's length target.
```

---

## P23 — Full-Auto Dry Run + v3 Ship

```text
Milestone 23 — prove the machine, then ship.

1. End-to-end dry run: pick the current #1 trending cluster → idea → judges → brief (I approve) → script → RenderSpec → render → all judges → thumbnails → Publish Center ready. Measure and print: wall-clock time, API cost, judge attempts used. Target: <45 min and <$2 per synthetic video after warm caches.
2. Cost dashboard: per-video and per-day spend (LLM + ElevenLabs + image gen), monthly projection at current cadence.
3. Failure drills round 3: kill each external key mid-pipeline; corrupt a render; force 3x judge failure → verify escalation queue catches everything and nothing half-publishes.
4. README v3: full architecture (mermaid), the two-lane flow, judge network map, self-improvement loop diagram, ops runbook, and the honest-limits section (3 platform walls, human touchpoints and why they exist).
5. Tag v3.0.

Then print the "Operator's Card": my exact recurring duties as the human — expected: ~15 min/morning (approve briefs, review escalations), ~10 min/publish tap + Golden 60 replies, capture-lane recording sessions 2x/week, 30-min weekly review of memo + lessons + playbook proposals. Everything else is the machine's job.
```

---

## Architect's Review of the Full 3-Phase Plan (self-critique, as requested)

**Risk 1 — Judge costs and regen loops runaway.** Mitigated: cheap model for all judges, per-video budget cap ($0.50 default), max 3 attempts, escalation instead of infinite retry. Watch the cost dashboard weekly.

**Risk 2 — Synthetic-lane sameness.** 100% automated formats drift toward template monotony — the exact pattern platforms police. Mitigations built in: lesson memory penalizes repeated failure modes, composition rotation, your opinion injected at brief approval, and a standing rule — capture-lane (real you) ≥30% of output. Do not lower that floor.

**Risk 3 — Self-improvement corrupting itself.** Auto-tuning on small samples chases noise. Mitigations: N≥20 gates, ±10% weight nudges max, evidence-cited lessons only, manual approval for prompt promotions and playbook changes. The system proposes; you ratify.

**Risk 4 — Voice-clone and AI disclosure.** ElevenLabs clone of your own voice is fine; toggle the platform's AI-disclosure where asked. Non-disclosure, not AI use, is the removable offense.

**Risk 5 — The operator abandoning the Golden 60.** The most automated system still loses to a less automated creator who replies to comments in hour one. The Operator's Card exists because those ~40 min/day are the highest-ROI minutes in the entire architecture.

**What I would cut first if overwhelmed:** P21's timed-swap fallback, P22's monthly cadence (make it quarterly), DataStory composition. **What I would never cut:** the judges (P18), the escalation queue, the brief-approval gate, capture-lane floor.


<!-- ============================ PART 4: CONTENT & AUTOMATION CATALOG ============================ -->

# PART 4 — The Complete Content & Automation Catalog

Everything discussed and researched in this project, converted into an executable catalog: every format, its automation lane, its system mapping, and the human residue. Then the seed idea bank, the repurposing matrix, and P24 — the prompt that loads all of this INTO the system.

Automation % is honest: it means "share of total production effort the machine does after brief approval."

---

## 4.1 FORMAT CATALOG

### A. Short-form video (YT Shorts / IG Reels / FB Reels)

| # | Format | Lane | Auto % | System mapping | Human residue |
|---|---|---|---|---|---|
| 1 | AI tool demo (#1 trending format) | Hybrid | 85% | Screen capture of tool + NewsTake/HookFrame comps, auto-edit, captions | 2–5 min using the tool on camera/screen |
| 2 | One-problem micro-tutorial | Synthetic | 95% | CodeTyping comp from script | Brief approval only |
| 3 | Before/after with numbers | Synthetic | 95% | BeforeAfter comp (new, P24) | Approval |
| 4 | Edutainment listicle ("3 tools that feel illegal") | Synthetic | 100% | ListicleCards | Approval |
| 5 | Build-in-public episode | Capture | 60% | Shot list gen, silence-cut, speed-ramp, captions, hook prepend | Record the build |
| 6 | Results-first reveal | Hybrid | 75% | Payoff clip (capture) + synthetic wrap | Record payoff moment |
| 7 | VS battle / comparison | Synthetic | 90% | SplitCompare comp (new, P24) | Approval; run both tools if live test |
| 8 | Contrarian myth-bust | Synthetic | 95% | HookFrame + NewsTake | Approval — opinion is the point; edit the take |
| 9 | Faceless b-roll + text overlay | Synthetic | 100% | KineticCanvas | Approval |
| 10 | Specific storytime | Synthetic (cloned voice) | 85% | KineticCanvas under narration | Write/verify the true story beats |
| 11 | Speedrun / timelapse build | Capture | 60% | Auto speed-ramp + captions | Record |
| 12 | Reply-to-comment video | Synthetic | 85% | CommentMiner (new, P24: YouTube commentThreads API) surfaces reply-worthy comments → micro-tutorial render | Pick the comment |
| 13 | Challenge with stakes (series) | Capture | 50% | Series planner continuity, per-episode packaging | Do the challenge |
| 14 | Question-hook explainer | Synthetic | 95% | HookFrame + CodeTyping | Approval |
| 15 | Green-screen news commentary | Synthetic | 90% | Screenshot pan + cloned-voice take | The take itself (edit LLM draft) |
| 16 | Terminal ASMR loop | Synthetic | 100% | KineticCanvas + keyboard audio bed, loop-engineered final frame | Approval (use sparingly) |
| 17 | Trend-twist (early trend + your spin) | Hybrid | 70% | Trend Engine flags <48h-old risers; twist drafted by LLM | Approve the twist fast (deadline chip) |
| 18 | Weekly Builder's Brief (news, opinionated) | Synthetic | 95% | NewsTake ×3 stories from week's top clusters | Your verdicts per story |
| 19 | Math/algorithm visual (optional differentiation lane) | Synthetic | 90% | Manim sidecar (optional, P24 stretch) — code-rendered proofs/visualizations | Verify correctness — non-negotiable for math |

### B. Static & carousel content

| # | Format | Auto % | System mapping |
|---|---|---|---|
| 20 | IG carousel (7-slide, save-magnet) | 100% | CarouselRenderer (new, P24: HTML-to-image, brand-tokened) from brief's ig_carousel payload |
| 21 | Architecture/cheat-sheet diagram (IG + Pinterest 2:3) | 95% | DiagramCard template; also exports Pinterest ratio |
| 22 | Stat/quote card | 100% | Template render — low originality, ≤1/week, always from YOUR data |

### C. Long-form video (the revenue layer)

| # | Format | Lane | Auto % | Notes |
|---|---|---|---|---|
| 23 | Deep tutorial (5–8 min) | Capture | 55% | Weekly anchor; Shorts feed subscribers, this feeds watch time + CPM |
| 24 | Tool verdict long-form | Hybrid | 70% | SplitCompare segments + capture testing |
| 25 | "30 days of X — the data" documentary | Hybrid | 65% | DataStory comps over your logged numbers — the system's own MyPost/cost data is content |
| 26 | System build walkthrough (Content OS series) | Capture | 55% | The machine documenting its own construction — S-tier meta content |

### D. Text content (blog / newsletter / LinkedIn / X)

| # | Format | Auto % | System mapping |
|---|---|---|---|
| 27 | First-person experiment post w/ original data | 80% | BlogComposer (new, P24) drafts from pipeline logs + MyPost data; you add the judgment paragraph |
| 28 | Comparison/decision page (affiliate revenue) | 75% | Drafted from VS-battle briefs + your test notes; citation-optimized structure enforced |
| 29 | Deep tutorial with code | 70% | Auto-draft from capture-lane script + code blocks; you verify code runs |
| 30 | Template/resource post (lead magnet) | 85% | Packages your actual scripts/workflows; email-capture CTA injected |
| 31 | Weekly newsletter | 90% | NewsletterComposer (new, P24): compiled from Morning Digests + week's briefs + one human intro paragraph |
| 32 | LinkedIn native post | 95% | From brief payload, link-free, code inline |
| 33 | X thread (3-part) | 95% | From brief payload |
| 34 | dev.to + Hashnode syndication | 100% | Syndication job (new, P24): both have public APIs; canonical URL to your domain, fully automated |

**Evaluated and parked (from our niche analysis):** pure AI-news channel (saturated + policy-exposed → reduced to format #18), makeup (demonstration/trust niche, incompatible with this automation stack and brand), Reddit-story/slideshow slop formats (Tier-3 dead, demonetization bait — permanently excluded).

---

## 4.2 THE REPURPOSING MATRIX (one idea → nine assets, automated fan-out)

Every approved brief fans out automatically (P24 wires this):

CORE IDEA → ① YT Short + ② IG Reel + ③ FB Reel (one render, three platform profiles) → ④ IG carousel (CarouselRenderer) → ⑤ LinkedIn post → ⑥ X thread → ⑦ blog draft (BlogComposer) → ⑧ newsletter item (queued for weekly compile) → ⑨ dev.to/Hashnode syndication (after blog publishes).

Marginal cost of assets ④–⑨: near zero. This matrix is why 1 good idea/day = 60+ assets/week.

---

## 4.3 SEED IDEA BANK (loaded by P24's seed script)

Format: title concept → [format #] (hook pattern). All from this project's discussion + research. Statuses start as backlog.

**Pillar A — Builds & Automations**
1. WhatsApp birthday-wish bot — never forget again → [2] (Results First)
2. Excel report: 2 hours manual vs 11 seconds Python → [3] (Results First)
3. AI reads my email and drafts replies → [1] (Confession)
4. YouTube videos → auto Notion notes → [2] (Results First)
5. n8n workflow that finds freelance leads while I sleep → [1] (Open Loop)
6. Expense tracking from bank SMS, automated → [2] (Identity Call)
7. Scrape any price → Telegram alerts → [2] (List Tease)
8. Bot that applies to jobs for me — 30-day results → [25] (Open Loop)
9. Invoice generation + send, fully automated → [2] (Identity Call)
10. Meeting notes: record → transcribe → action items pipeline → [2] (Results First)
11. "I automated my entire Instagram with Python" (this system!) → [5]/[26] series (Confession)
12. Watch my AI agent burn $50 in 3 minutes — the 4-line fix → [1] (Open Loop) *(from your docs)*
13. Stop blindly installing MCP servers — your AI is leaking your file system → [8] (Mistake Warning) *(from your docs)*
14. AI QA agent that finds the bugs AI code created → [1] (Contrarian) *(from your docs' tech-debt angle)*
15. Auto-organize any messy folder with 30 lines → [2] (Before/After)
16. Screenshot → working code tool → [1] (Open Loop)
17. Git commits that write themselves (honest verdict) → [2] (Question)
18. Browser bot fills every form for me → [1] (Identity Call)
19. Portfolio site that updates itself from GitHub → [2] (Results First)
20. My laptop works while I sleep: the full night-shift stack → [5] (Open Loop)

**Pillar B — Tool Verdicts & Battles**
21. ChatGPT vs Claude vs Gemini: 50 Python prompts, scored → [7]/[24] (List Tease)
22. Claude Code vs Cursor: copilot vs full automation → [7] (Contrarian) *(from your docs)*
23. n8n vs Make vs Zapier: same workflow, three builds → [7]/[28] (Question)
24. Stop paying ₹4,000/mo — the free AI alternative → [4] (Contrarian)
25. Local LLM vs cloud: my real cost test → [7]/[25] (Confession) *(from your docs)*
26. ElevenLabs vs the free clones: can you hear it? → [7] (Question)
27. Rust secures what Python built — the demo → [7] (Contrarian) *(from your docs)*
28. Best AI tool for freelancers: I tested the top 5 → [4]/[28] (Identity Call)
29. I deleted 10,000 lines of React for one HTML file → [3] (Contrarian) *(from your docs)*
30. The ₹0 automation stack: everything free, assembled → [4]/[30] (List Tease)

**Pillar C — Explainers (evergreen engine)**
31. APIs explained like you're 5 → [2] (Question)
32. Webhooks in 45 seconds → [2] (Question)
33. What MCP actually is (everyone says it wrong) → [8] (Contrarian)
34. Embeddings: why AI "understands" anything → [14] (Question)
35. Cron: the oldest automation still running the internet → [9] (Open Loop)
36. 5 regex one-liners that replace whole scripts → [4] (List Tease)
37. Docker in 60 seconds, no jargon → [2] (Question)
38. Async explained with a chai-stall analogy → [14] (POV)
39. Vector databases: 45-second mental model → [2] (Question)
40. Technical debt: why AI code costs you later — and the fix → [8]/[23] (Mistake Warning)
41. Spec-driven "vibe coding" done right (.cursorrules) → [2] (Identity Call) *(from your docs)*
42. Why your AI agent loops forever (and the kill switch) → [2] (Mistake Warning)

**Pillar D — News-takes & Series containers**
43. Weekly: 3 AI things that actually matter for builders → [18] recurring (List Tease)
44. Series: "Automation Autopsies" — I dissect a viral automation claim → [8] recurring (Contrarian)
45. Series: "Day X of automating my entire life" → [5] recurring (Confession)
46. Series: "Steal This Script" — one paste-ready script weekly → [2] recurring (Results First)
47. Series: "Feels Illegal" — one underrated tool weekly → [1] recurring (List Tease)
48. Content OS build series: the system that runs this channel → [26] multi-episode (Open Loop)
49. "30 days, N videos, the honest data" → [25] monthly (Confession)
50. My AI publishes while I sleep — full pipeline reveal → [5]/[23] (Open Loop)

*(Optional math lane, if activated: 51. Why 0.999… = 1, visually → [19]; 52. The algorithm behind your feed, animated → [19]; 53. Big-O explained in one moving picture → [19].)*

---

## 4.4 — P24: Load the Catalog Into the Machine (final prompt)

```text
Milestone 24 — encode the Content & Automation Catalog into the system.

1. FormatRegistry model + seed: {id, name, lane(synthetic|capture|hybrid), autoPct, compositionIds[], platforms[], cadenceWeight, active} — seed ALL formats from the catalog (Part 4.1). Brief Studio and the Idea Bank ranking must now read lane/cadence from the registry instead of hardcoded lists; the orchestrator's lane routing (P20) also reads it.
2. New compositions: SplitCompare (two-column battle with score punches), BeforeAfter (metric flip reveal), DiagramCard (architecture/cheat-sheet, exports 9:16 + 2:3 Pinterest ratio). Brand-tokened like the rest.
3. CarouselRenderer: HTML-to-image pipeline rendering the brief's ig_carousel payload into 7 branded slides + cover; attaches to the IG PublishItem.
4. CommentMiner: job pulling commentThreads (1 unit) on MY recent uploads; LLM flags reply-worthy comments (questions, objections, requests) → one-click "make reply video" creates a brief pre-filled with format #12.
5. BlogComposer: job drafting blog posts from (a) capture-lane scripts + code, (b) pipeline/MyPost data for experiment posts — citation-optimized structure enforced (quick-answer block, headers, author schema stub); output lands as a draft Brief of kind blog for my edit pass.
6. NewsletterComposer: weekly job compiling Morning Digests + published posts + one "from me" placeholder into a markdown newsletter draft.
7. Syndication job: after I mark a blog post published with its URL, auto-push to dev.to and Hashnode via their APIs (env keys) with rel=canonical to my domain; log results.
8. Repurposing fan-out: on brief approval, auto-create ALL derivative PublishItems per the matrix (4.2) — carousel, LinkedIn, X, blog-draft trigger, newsletter queue — respecting judges before ready-status.
9. Seed script: load the 50-idea Seed Idea Bank (4.3) into IdeaBank with pillar, format ref, hook pattern, status backlog — deduped against anything already present.
10. Idea Bank "Make Next" now balances across pillars AND formats (avoid 5 listicles in a row) using cadenceWeight.

Acceptance: registry table populated; one brief fans out to ≥6 derivative assets automatically; CarouselRenderer outputs 7 branded slides; CommentMiner surfaces real comments from my channel; seed script loads 50 ideas deduped; "Make Next" visibly rotates formats. Tag v3.1.
```

---

## 4.5 Catalog Ground Rules

- Format mix floor: capture-lane (real you) ≥30% of published output — the trust layer that keeps synthetic volume monetizable.
- 100%-auto formats (#4, #9, #16, #20, #22) are seasoning, not the meal: cap at ~40% of weekly output or you rebuild the slop pattern platforms kill.
- Every synthetic script still carries your opinion from brief approval — that 2-minute edit is what "original content" legally and algorithmically means.
- The Seed Bank is fuel, not scripture: the Trend Engine + saturation gap decide WHEN each idea fires; calibration decides which formats earn more slots.
