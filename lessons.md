# Lessons

Format: *tried → broke → rule*. Read before retrying anything that failed
once; append after every failed attempt or surprise.

- Tried `npm install better-sqlite3` (P2) → node-gyp failed, no MSVC C++
  toolchain on this machine → **no native Node deps, ever; use JSON files
  in data/ as the store.**

- Tried `pip install manim` with system Python 3.14 (P4) → moderngl/
  glcontext have no cp314 wheels, source build needs the same missing C++
  toolchain → **use the project .venv built from D:\python312 (3.12);
  check wheel availability before adopting a new Python-native dep.**

- Tried installing Manim to global Python on C: (P4) → `OSError: No space
  left on device`, C: was at 0.02 GB free → **C: is chronically full: all
  heavy installs/caches go to D: (.venv, pip temp in data/piptmp, model
  caches in data/models). Check `Get-PSDrive C` before big installs.**

- Tried `npm --prefix "D:/...apps/mission-control" run dev` via
  launch.json (P6) → spawn died on the space in "C:\Program Files\...\npm"
  → **start the portal only via scripts/mission-control.cmd; if a spawn
  mysteriously fails with 'C:\Program' not recognized, it's the
  space-in-path bug.**

- Tried a PowerShell here-string commit message containing quotes (P4) →
  git parsed the tail as pathspecs and errored → **write the message to a
  file and `git commit -F <file>`.**

- Tried fetching Reddit RSS in parallel bursts (P2/P3) → 403s from
  rate-limiting → **fetch Reddit sequentially with a browser User-Agent,
  and let the radar degrade gracefully when a source 403s.**

- Tried importing factory packages directly from Next.js API routes (P3)
  → webpack can't resolve cross-package dynamic imports outside the app →
  **portal API routes always spawn the CLI (`startJob`), never import
  pipeline code.**

- Tried Remotion `<OffthreadVideo>` for the math overlay first (P4) →
  (worked, but) frame-accuracy relies on the manim clip being CFR 30fps →
  **always render manim with explicit `-r 1080,1920 --fps 30` so overlay
  frame math stays exact.**

- Browser-pane screenshots intermittently time out on this machine →
  **verify pages with read_page/get_page_text first; screenshots are
  best-effort proof, not the verification path.**

- Tried detecting whisper-ctranslate2 via `--help` exit code (P6 polish) →
  its help text contains CJK chars, cp1252 console → UnicodeEncodeError,
  exit 1, tool looked "not installed" → **spawn Python CLIs with
  PYTHONIOENCODING=utf-8 on Windows, and probe with `--version` (short
  ASCII) instead of `--help`.**

- Tried SAPI `SetOutputToWaveFile` with a relative path after PowerShell
  `Set-Location` (P6 polish) → .NET resolves against the PROCESS cwd, not
  PowerShell's location; file went to the wrong repo → **always pass
  absolute paths to .NET APIs from PowerShell.**

- The portfolio repo's .claude/launch.json lost the mission-control entry
  between sessions (reverted with other working-tree changes) → **if
  `preview_start mission-control` says "no server named", re-add the entry
  pointing at scripts/mission-control.cmd.**

- Piped `node ... | Select-Object -First N` (P5 debug) → PowerShell closes
  the pipe after N lines, node dies on EPIPE (exit 255) BEFORE its final
  file writes — data looked mysteriously unwritten → **never truncate a
  state-writing command's output; capture fully, or filter with
  Select-String/-Last which consume the whole stream.**

- store.js upsert spread order `{ id: newId(), ...row }` silently restored
  row's explicit `id: undefined` (P4/P5) → every cluster row lacked ids,
  React keys broke downstream → **when a spread and a default share a key,
  the default must come AFTER the spread.**

- Tried `/^\s*KEY\s*=\s*\S/m` to detect a filled .env key (P10) → `\s`
  matches NEWLINES, so an empty `KEY=` line matched the next line's text
  and reported the key as set → **never use \s around = in multiline env
  regexes; parse line-by-line (lib/factory.js envSet) — the .env here is
  the template with EMPTY placeholder values, so presence-of-line checks
  always lie.**

- The P8 worker's hourly YouTube tick called nicheHeat() every 60min =
  ~600 units × 24 = 14,400/day, DOUBLE the 8000 cap (found in P12) →
  **niche heat is a daily-cost job, not hourly; worker now gates it with
  ranToday("yt-heat"). Any per-hour job that spends >100 units/call needs
  a once-daily gate or it blows the quota. P16 formalizes this in the
  allocator.**

- setState is async: `onClick={() => { setHandle(c.id); watch(); }}`
  (P12 discover→watchlist) reads the STALE handle inside watch() →
  **pass the value directly (`watch(c.id)`), never setState-then-read in
  the same handler.**

- `Number(flagValue) || DEFAULT` silently ignored an explicit `0` — hit
  TWICE in one session (`batch --max-cost=0` still spent; `prune --days=0`
  still used 30) → **for any numeric CLI flag where 0 is meaningful, check
  presence explicitly: `raw !== undefined && Number.isFinite(Number(raw))
  ? Number(raw) : DEFAULT`. Never `||` a numeric default.**

- Motion Lab's ranker read `e.attention` off the catalog entry, but measured
  scores live in the `motionbench` collection (`benchResults()`). The field
  never existed, so `measured ? … : 1` always took the null branch and the
  entire measurement term was dead — the feature's headline claim ("ranked on
  measured pixels") was quietly false while every test still passed →
  **a `??`/`?:` guard on a misspelled or non-existent field degrades silently
  instead of throwing. When a term is supposed to change a score, assert it
  actually does: log the score with and without it once, or the optional
  chain hides the bug forever.**

- Normalisation ceilings for the attention metrics were guessed (12/10/25).
  Real ffmpeg YAVG deltas land in 0.05–1.4, so every effect scored ~0.02 and
  the ranking was noise → **never guess a normalisation range; render a few
  known-contrasting samples, print the raw values, then set the ceiling.**

- Cost was multiplied into the effect fit score at full weight, which ranked
  a cheap 0.4× overlay chip above the effect that actually fitted the scene
  (step-chip 0.8 vs code-rain 0.52 for a terminal scene) → **a tie-breaker
  must be scaled like one (`0.9 + 0.1*x`), not multiplied in as a peer term.**

- Benching the catalog graded ambient backgrounds and hooks on one
  "more motion = better" axis, so calm-by-design beds (tilt-parallax 0.24,
  macro-vignette 0.08) read as failures → **score against what the thing is
  FOR. A background wants a motion band; a hook wants opening energy; an
  overlay measured on a blank frame should refuse to score at all.**

- Adapting the `humanizer` skill (Wikipedia "Signs of AI writing") as a flat
  banlist would have DEGRADED output: it bans rule-of-three and "Here's the
  thing", but both are proven retention devices in a spoken hook, and it
  treats emoji as a violation when they're native to an IG caption →
  **when porting a rule set from another medium, check every rule against
  THIS medium before adopting it. A pattern table needs a `native` weight
  ("expected here, never flag"), not just severities. Blind adoption of a
  good rule set is still a regression.**

- The humanize audit scored the factory's own copy 98/100 — because all 18
  briefs are still `[fill:]` templates, so it was grading scaffolding, not
  LLM output → **before trusting a quality metric, verify the corpus it
  measured is the thing you think it is. A flattering score over the wrong
  input is worse than no score; the audit now prints the template warning
  itself.**

- An em dash in a `scene.voiceover` field is not a style nit, it's a render
  bug: ElevenLabs turns it into an unpredictable pause and every downstream
  word timestamp (captions, Remotion timeline) shifts → **voiceover fields
  are TTS INPUT, not prose. Emoji, markdown and dashes must be stripped
  before synthesis, and any new code path writing `scene.voiceover` has to
  go through `humanize.autoFix(..., {surface:"voiceover"})`.**

- The first em-dash fix turned BOTH dashes of a parenthetical into periods
  ("This tool. which I use daily. can transform"), producing broken grammar
  that TTS then read as three fragments → **a paired delimiter and a lone
  one mean different things; handle the pair first, then whatever remains.**

- `const fetchOpts = { signal: AbortSignal.timeout(15000) }` at MODULE level
  shares one signal across every request, and it starts counting at import.
  Any collect run longer than 15s aborted every subsequent fetch with a
  TimeoutError. It went unnoticed for the entire project because all the
  existing fetches fire in one `Promise.allSettled` burst at the start —
  only the first sequential fetch added afterwards ever hit it →
  **request options carrying a signal, deadline or timestamp MUST be built
  per call (`const opts = () => ({...})`). A shared `AbortSignal.timeout` is
  a time bomb with a 15-second fuse, and spreading it into a second const
  (`{...fetchOpts, headers}`) copies the bomb, not the timeout.**

- The radar ranks 120 clusters and prints a confident top-3, but every one
  was a singleton scoring `0 velocity + 5 crossSource floor + 16 heuristic
  fit + 7 default saturation = 28` — pure defaults. Relative ranking ALWAYS
  produces a winner, so a sorted table reads like a set of leads even when
  nothing in the pool has earned it (adapted from last30days' confidence
  floor) → **a ranker needs an ABSOLUTE bar in addition to the sort, and the
  honest answer "nothing qualified today" must be reachable. Sorting is not
  evidence.**

- Reimplemented `velocityBaselines` in the CLI instead of importing it, and
  the copy lacked the `VELOCITY_BASELINES` seed defaults — so `evidence
  report` called a cluster a 4.3× spike while `evidence ground` called the
  same cluster unproven, in the same session → **never reimplement a scoring
  function for a second caller; export the original. Two copies of a formula
  is two answers to one question.**

- Captured post bodies to get "community quotes" and the top results were
  Vercel and OpenAI blog prose — marketing copy wearing a quote's clothes.
  A corporate RSS feed and a subreddit both arrive with 0 points, so nothing
  distinguished them → **"engagement over editorial authority" needs the
  source CLASS encoded explicitly; it does not fall out of the metrics.**
  Related: a line beginning `>` is the commenter quoting someone else —
  attributing it to them fabricates a quote.

- `.env` value `OPENROUTER_API_KEY = "sk-or-..."` broke auth: the parser
  handled the spaces but NOT the quotes, so the header became
  `Bearer "sk-or-…"` and OpenRouter replied 401 "Missing Authentication
  header" — which reads like a missing key, not a quoted one →
  **an env parser must strip one layer of matching surrounding quotes, like
  dotenv. Pasting KEY="value" is the natural thing to do.**

- `factory ai` reported all three tiers READY on an account with ZERO
  credits, because availability was `Boolean(env.OPENROUTER_API_KEY)` — a
  key-EXISTS check, not a can-it-run check. Every paid call then answered
  "Insufficient credits" and free models throttled after two requests →
  **a readiness indicator that only checks configuration will confidently
  lie. Probe the provider (`/api/v1/credits`) and report the real state.**

- Two hardcoded model ids had rotted: `meta-llama/llama-3.3-70b-instruct:free`
  now 404s "unavailable for free" and `google/gemini-2.0-flash-001` 404s "No
  endpoints found" (current is gemini-3.6). Both silently degraded the whole
  system to template mode →
  **model ids are perishable. Keep them in env vars, treat the code default
  as a guess, and ship a way to list what is valid TODAY
  (`factory ai models`).**

- There was no 429 handling anywhere in the LLM router: a throttled call threw,
  the chain found no cheaper option, returned null, and the caller degraded to
  heuristics. On a rate-limited free tier that means "configured but behaves
  keyless" → **retry transient failures (429/502/503/504) with backoff before
  abandoning a provider, and never retry 401/404 — a config error must surface
  in a second, not after 90.**

- OpenRouter's FREE pool is congested per-model, and the popular models are
  the congested ones: `google/gemma-4-31b-it:free` measured 0/4 requests
  while `google/gemma-4-26b-a4b-it:free` measured 4/4 with 9s spacing.
  Picking the biggest free model made the whole tier look broken and sent
  every brief back to [fill:] templates →
  **on a shared free tier, choose for RELIABILITY first and capability
  second, and keep a second, different free model in the fallback chain —
  congestion is per-model, so one alternate rescues far more runs than
  retrying the same busy model.**

- The humanizer's AI-vocabulary pattern used `leverage[sd]?`, which cannot
  match "leveraging" — the word is leverag+ing, so "leverage" is not even a
  substring. The first REAL generated brief came back with "Leveraging
  AirLLM to…" and scored a clean 100. Same blind spot for utilizing and
  facilitating →
  **for -ing forms match the STEM (`leverag(?:e[sd]?|ing)`), and remember
  that a detector can only be validated against real output: this pattern
  passed every synthetic test because I wrote the test strings myself.**

- The Settings API hand-maintained its OWN copy of the AI tier table, and it
  had drifted to advertising "llama-3.3-70b:free" and "gemini-2.0-flash" —
  both dead ids that 404 — so the portal confidently displayed models that
  could not run. Same failure class as the duplicated velocityBaselines →
  **a registry with a second hand-written copy is not a registry. Derive UI
  from the source module (tierAvailability/serviceAvailability), never
  re-list its contents in a route.**

- Renaming TIER_NAMES from free/budget/premium to free/cheap/medium/best
  would have silently broken three consumers that hardcoded the old strings
  (`autoedit.js` whisper mapping returned "base" for every tier, and two
  Settings UI arrays rendered dead chips) →
  **when an enum is a public contract, grep for its VALUES before renaming,
  add an alias map for persisted configs, and make the resolver normalise
  rather than fall back — a fallback hides the break, an alias fixes it.**
