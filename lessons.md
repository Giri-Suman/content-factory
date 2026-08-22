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

- Adding `hn-show` and `github-new` as collector lanes would have created FALSE
  cross-source corroboration: `sourceType()` mapped them to new types, so one
  story appearing on HN front page and Show HN would have counted as "2
  independent sources" and cleared the evidence floor →
  **when you add a collector, check how it maps in the source-type function.
  Two queries against one site are one source. A new lane silently widens
  every downstream rule that counts source diversity.**

- Conversely, collapsing every RSS feed to one `"rss"` type meant a story on
  Product Hunt AND in Ben's Bites AND on TechCrunch counted as a single source,
  so genuine corroboration could never register → **feed KIND is real evidence
  structure: vendor (primary), press (weak confirmation), newsletter (human
  filter), launch (votes). Over-collapsing is as wrong as over-splitting.**

- Entity grounding demoted all 6 members of a real cluster ("AI security and
  safety concerns" — mass vulnerability scans, device hijacking, cracked
  encryption) because none contained the literal word "security" →
  **grounding guards against ACCIDENTAL keyword grouping. When an LLM read the
  titles and grouped them, re-litigating membership with a token test is the
  wrong instrument; thematic labels never share tokens with the specific
  stories under them. Tag the clustering method and skip grounding for LLM
  groupings.**

- Unauthenticated Reddit is effectively dead, not merely slow: 1 of 5 subs
  succeeded at BOTH 5s and 9s spacing. The old code paced subs 400ms apart and
  tried 4 endpoints each (~48 rapid requests), so r/LocalLLaMA was configured
  but essentially never collected →
  **when a source fails, measure whether pacing actually helps before building
  backoff. If it doesn't, the honest designs are a rotating window (collect 3
  properly rather than failing 15) plus support for the free auth path.**

- One LLM call clustering 120 items into 4000 tokens of JSON succeeded once and
  failed the next run on a small free model — and a failure makes every cluster
  a singleton, so nothing can ever be corroborated →
  **size a structured-output prompt for the weakest model in the chain, and
  give it a smaller-batch fallback. Partial success beats total degradation.**

- `ADAPTIVE_OK = /opus-4-[678]|sonnet-5|fable/` gated adaptive thinking by
  ENUMERATED version, so `claude-opus-5` — the newest and most capable model —
  was the one silently running without it →
  **a capability gate keyed to a version list fails on every increment, and
  fails silently in the direction of less capability. Match the family and let
  the version float: `(opus|sonnet|fable)-(?:4-[678]|[5-9])`.**

- `.sidebar { height: 100vh }` with no `overflow-y` hid the tail of the menu
  entirely: 24 links measure 1145px against a 720px viewport, so 425px of nav
  was unreachable by any means, with no scrollbar to hint at it →
  **a fixed-height flex column holding a growing list needs `overflow-y:auto`
  the day it is written. Measure `scrollHeight` vs `clientHeight`, don't eyeball
  it — the overflow is invisible precisely because it is clipped.**

- The trends category filter WAS working, but "all" and "AI" both rendered 60
  rows because the table caps at `.slice(0, 60)` and AI has 76 matches — so it
  looked broken → **any truncated list must say "showing N of M". A silent cap
  makes correct filtering indistinguishable from a broken filter, and the bug
  report you get is "the filter doesn't work".**

- The Manim layout lint's first version flagged BOTH hand-written demos, which
  are known good: it checked for positioning on the same line, but idiomatic
  Manim assigns first and positions after (`equals = Text(...)` then
  `equals.next_to(...)`, or via `VGroup(...).arrange()`) →
  **validate a new detector against known-GOOD inputs before trusting it on bad
  ones. A detector with false positives on the reference implementation is
  worse than none, because it trains you to ignore it.**

- Overlapping text in generated Manim scenes was never a rendering bug — the
  prompt constrained the frame bounds but never said "remove what a beat
  finishes with", and Manim removes nothing on its own →
  **when generated output has a recurring structural defect, check whether the
  prompt ever forbade it. Adding a lint without fixing the prompt just detects
  the same failure repeatedly.**

- Anti-slop guidance lived only in the humanizer, which runs AFTER generation.
  Moving it into the prompts (derived from the same pattern table via an
  `avoid` field, so the two cannot drift) prevents the tell instead of scoring
  it → **a detector and a preventer for the same defect should share one
  definition; the detector then becomes a backstop rather than the mechanism.**

- Several best-in-class open models are NON-COMMERCIAL and are exactly the ones
  older blog posts recommend: XTTS v2 (Coqui CPML), F5-TTS and Fish Speech
  (CC-BY-NC). Wav2Lip is the subtle one — permissive CODE, but weights trained
  on LRS2, and the dataset licence governs →
  **cut by licence FIRST, then quality. A model that passes your test render but
  cannot ship is worse than a weaker one that can, because you only find out
  after building on it. The gate must THROW, not warn: a log line nobody reads
  is not a legal defence.**

- Every pipeline re-encode was missing `-movflags +faststart`, so the moov atom
  landed at the END of every published short — verified on real output,
  `moov=-1` within the first 400KB. Players cannot start until the whole file
  downloads →
  **check the moov position on actual output, not the flag list. Remotion's own
  encode already did it, which is exactly why the missing flag on the SEVEN
  re-encode paths went unnoticed.**

- The trend radar structurally cannot see seasonal demand: it reports what is
  spiking now, and nothing spikes to announce that Diwali nail-art demand starts
  in three weeks →
  **date-driven demand needs its own calendar with a LEAD TIME per event. The
  actionable field is publish-by, not the event date — shipping Diwali content
  on Diwali is late.**

- `NICHE_CONTEXT` described a coding-only creator and is injected into 17
  modules' prompts, so every LLM judgment scored makeup, nails and math as
  "extreme niche misalignment". ideaJudge's coded half compounded it with a
  coding-only regex, docking 20 points from three of the four categories the
  channel exists to serve →
  **a shared identity string is load-bearing precisely because it is
  everywhere. When a system supports N categories, grep the identity constant
  before assuming the feature works for all of them — this was a correctness
  bug wearing a copywriting costume.**

- Even after fixing the identity text, a beauty idea still scored 28-42 while
  nail art scored 88. Cause: the prompt passed the first 8 idea-bank titles as
  novelty examples, and they were all coding — the model inferred the vertical
  from the EXAMPLES and ignored the stated identity →
  **few-shot examples outrank an instruction. If you tell a model what the
  brand is and then show it eight counter-examples, the examples win. Filter
  comparison sets to the same category as the item being judged.**

- `\bproof\b` in a math-detection regex matched "sweat-proof foundation" and
  classified a makeup review as math → **word boundaries do not respect
  hyphenated compounds; use `(?<![-\w])proof\b` when the term is a common
  suffix.**

- Originality was an exact lowercased title comparison against the idea bank
  only, so "5 Python tricks" and "Five Python Tricks You Should Know" were
  treated as unrelated, and anything already PUBLISHED was invisible to it →
  **dedup needs token overlap (with number-word collapsing) against everything
  already committed to — published posts first, since a duplicate of a live
  video splits your own search result.**

- Retake detection paired every duplicated word-shingle independently, so for a
  10-word line repeated at index 0 and 12, shingle [5,17] produced a cut ending
  at word 17 — inside the GOOD take. The synthetic test caught it because the
  test asserted the second take survived, not merely that a cut was produced →
  **when cutting a timeline from repeated-pattern matches, anchor one cut per
  event and jump past the match; per-match cuts overlap into the content you
  meant to keep. And assert what must SURVIVE, not just what gets removed.**

- `CHROME_PATHS` was hand-copied into FIVE files (doctor, carousel, prepare,
  stepCards, thumbnails). Deduping it broke `doctor` because the script removed
  the array but not a separate USAGE line — the regression caught it, the
  module-load check did not →
  **when removing a duplicated constant, grep for its NAME afterwards, not just
  for the declaration you deleted. And an import-loads check is not a
  smoke test; only running the command proves it.**

- Chrome resolves `--screenshot=` against ITS OWN working directory, so a
  relative output path silently writes somewhere else and the caller sees
  "produced no file". The same code worked and then failed minutes later purely
  because one call passed an absolute path and the next passed a relative one →
  **resolve paths to absolute at the boundary of any external process, and
  create the parent directory — the child will not, and the error it gives you
  names neither problem.**

- `capture url http://169.254.169.254/…` screenshotted the cloud instance
  metadata endpoint successfully. On most providers that serves credentials, so
  the portal was one deployment away from handing them to anyone who found the
  URL →
  **any feature that fetches a user-supplied URL is an SSRF hole the moment the
  app leaves localhost. Validate the RESOLVED ADDRESS, never the hostname
  string — an attacker controls their own DNS, so evil.com can simply resolve
  to 169.254.169.254.**

- Next only auto-loads `.env` from its OWN directory, not the monorepo root.
  Putting FACTORY_PASSWORD in the root `.env` left middleware seeing nothing,
  so the portal would have stayed OPEN — silently, with no error →
  **an auth control that fails open is worse than no auth control, because you
  believe you are protected. Load the env explicitly and verify with a real
  request (expect 307/401) before exposing anything.**

- The auth middleware exempted `/login` but not `/api/login`, so the gate locked
  you out of itself: logging in required a session, and getting a session
  required logging in. The first wrong-password test returned "not signed in"
  instead of "wrong password", which is what exposed it →
  **the login endpoint must always be exempt from the gate it feeds. And test
  the WRONG-password path, not just the right one — the failure mode was only
  visible in the error message.**

- The middleware hashes with WebCrypto (edge runtime) while the login route uses
  node:crypto. If those two produced different digests, login would appear to
  succeed and then every following request would fail →
  **when the same value is computed in two runtimes, assert they match; the
  bug would otherwise present as "it logs me out immediately".**

- A PowerShell script written as UTF-8 (no BOM) failed to parse with "the string
  is missing the terminator". Cause: Windows PowerShell 5.1 reads script files as
  cp1252, so an em dash (E2 80 94) became the three characters `a€"` — and that
  third byte maps to a QUOTE character, which closed the string early. The
  script looked perfect in every editor →
  **PS 5.1 scripts must be ASCII-only or UTF-8 WITH BOM. Prose punctuation
  (em dashes, smart quotes) in a .ps1 is a parse-time landmine, and the error
  message points at the string, not the encoding.**

- Bisecting the parse errors was the only thing that found it: the first 100
  lines parsed clean, the full file did not, and the reported line was correct
  but the reported CAUSE was misleading →
  **when a parse error makes no sense, parse progressively larger prefixes.
  And check the bytes (`cat -A`), not the rendering — the corruption is
  invisible in a normal editor view.**

- Nearly "fixed" `$tunnelId.json` in a PowerShell string, believing it would be
  parsed as property access. It is not: PS only does property access in strings
  via `$(...)`; a bare `$var.prop` expands the variable and leaves `.prop`
  literal → **verify the bug exists before fixing it; a confident wrong fix to
  working code is worse than the imagined bug.**

## Assumed a laptop dependency that the code did not actually have

**tried** — answering "do I need the laptop on 24/7?" by measuring how bad a
collection gap is, then offering a Windows wake-timer task so the machine could
sleep between collects.

**broke** — the question was right and my framing was wrong. The user pointed out
the code is already on GitHub. `radar collect` turns out to be **pure Node with
zero dependencies** — no Chrome, no ffmpeg, no Python (the five `python` hits in
packages/radar are keyword strings inside regexes). It reads and writes exactly
one file, `data/trends.json`, 1.1MB. It never needed to run on this machine at
all, so the whole wake-timer idea was an elaborate solution to a self-inflicted
constraint. Deleted it.

**rule** — before optimising *around* a constraint, check whether the constraint
is real. Grep the actual dependency surface of the specific code path. A monorepo
that needs ffmpeg somewhere does not mean the path you care about needs it: this
CLI has **88 dynamic imports vs 4 eager**, so `radar collect` loads the radar
chain and nothing else. Lazy-loading is why `npm ci` can be skipped in CI, and
that is worth verifying rather than assuming in either direction.

Two things worth keeping from the measurement:
- **Time the job before choosing a cron cadence.** A real run is 651s. On a
  private repo (2000 free Actions min/month) that makes every-4h ~1950 min = 98%
  of budget, and every-6h ~1300 = 65%. Guessing "hourly" would have silently run
  out of minutes mid-month.
- **`config.js` populates `process.env` without overriding what is already set**,
  so CI needs no `.env` file — verified with a sentinel value rather than assumed.

## Signing code you cannot test against the real service

**tried** — writing SigV4 request signing for R2 with no Cloudflare credentials
available, planning to find out whether it worked on the first real upload.

**broke** — nothing yet, which is the problem. R2 rejects a bad signature with an
opaque `403 SignatureDoesNotMatch` and tells you nothing about *which* step was
wrong: the signing-key derivation, the canonical request, the header ordering, or
the percent-encoding. Debugging that against a live service is guesswork.

**rule** — AWS publishes SigV4 test vectors with the exact canonical request, its
SHA-256, and the final signature. Check against those and the implementation is
proven before any credential exists. `test/r2-sigv4.mjs` does this and passes
6/6, including the documented `aeeed9bb…` signature. To make it testable,
`signingKey()` takes region and service as parameters instead of closing over the
module constants — an untestable signing function is one you discover is wrong
from a 403.

The specific trap worth remembering: **`encodeURIComponent` is not sufficient**.
AWS requires `!'()*` percent-encoded too, so a key containing any of them signs
fine locally and 403s in production — a bug that surfaces months later on one
file. Hence the explicit `rfc3986()` and a test for it.

## A second project on the same Cloudflare account is a real blast radius

**tried** — adding R2 storage while coderfact.com is served from the same
Cloudflare account.

**broke** — nothing, but the near-miss is worth writing down. The portfolio is a
**Worker named `coderfact`** (`wrangler.jsonc` in the portfolio repo). Had this
repo gained a `wrangler` config reusing that name, `wrangler deploy` would have
silently *overwritten the live portfolio site*. Nothing about R2 warns you.

**rule** — when a second project shares a hosting account, pick the integration
path with the smallest blast radius, not the most convenient one. Here that meant
R2's **S3 API only**: no wrangler config, no Workers, no Pages, no DNS record, no
public bucket, and presigned URLs instead of a custom domain. R2 buckets have no
domain and no routes, so they cannot collide with a Worker. Also scope the API
token to the single bucket. Documented in DEPLOY.md so the constraint survives
the next person who thinks adding a wrangler config would be convenient.

## Readable.toWeb() crashes the server when a video request is aborted

**tried** — adding a Download button to the Renders page, then checking the dev
server log while verifying it.

**broke** — found a pre-existing landmine, not caused by the change. The video
route streamed with `Readable.toWeb(createReadStream(...))`. When a browser
aborts mid-transfer the web-stream controller closes while the fs ReadStream is
still emitting, and the adapter's `enqueue` throws `ERR_INVALID_STATE` as an
**uncaughtException**. Node exits on uncaughtException by default, so in
production (`npm start`, unlike dev) simply opening the Renders page would take
the portal down: 38 `<video preload="metadata">` elements each open a request,
read the header, and abort. 38 uncaught exceptions per page load.

**rule** — `Readable.toWeb()` is not safe for a route a browser can abort, and
video routes are aborted constantly: every seek and every metadata probe is one.
Build the `ReadableStream` by hand instead — `enqueue` inside try/catch,
`rs.destroy()` in `cancel()` so file handles are not leaked, and `pause()`
when `desiredSize <= 0` so a large file does not buffer into memory. Aborts are
normal traffic, not an error to surface.

Two things this taught about verifying:
- **Read the server log, not just the page.** The page rendered perfectly — 38
  players, 38 links, clean browser console — while the server was throwing fatal
  exceptions on every load. A screenshot would have shown nothing wrong.
- **Restart before trusting a clean log.** `preview_logs` returns accumulated
  history, so the old errors kept appearing after the fix and looked like it had
  not worked. The tell was the stack trace pointing at
  `webstreams/adapters` — code the new version never calls. A fresh server plus
  40 deliberately aborted requests gave the unambiguous answer: no errors.

## "Not configured" with a perfectly good .env — the loadEnv() convention

**tried** — reading `process.env.R2_*` directly in a new module, the way most
code in this repo appears to.

**broke** — `factory r2 status` reported all four variables missing while `.env`
contained correct values. The message was actively misleading: it named the exact
variables that were, in fact, set.

**rule** — this repo does NOT auto-load `.env`. `loadEnv()` is called explicitly
by each entry point (`doctor`, `health`, `prune`, `worker`, `judges`, and two
spots in the CLI), so any new module reached by a path that skips it sees an
empty `process.env`. Adding a new command means adding the `loadEnv()` call too.

Fixed at the source instead of per-caller: `r2Config()` now calls a memoised
`ensureEnv()`, so R2 behaves identically from the CLI, the render hook and the
portal route without auditing every entry point. Safe because `loadEnv()` never
overwrites an already-set variable — real environment variables (CI) still win
over the file, which is what the GitHub Actions workflow depends on.

Worth noting how it was found: the diagnostic printed *value lengths only*, never
the values. That immediately showed 32/32/64/15 characters — all correctly shaped
— which ruled out "user pasted it wrong" and pointed straight at the loader. Mask
secrets when debugging credentials; you almost never need to see them, and length
alone is usually the diagnostic.

## A gated robots.txt is the same as no robots.txt

**tried** — adding `X-Robots-Tag: noindex` in middleware plus an `app/robots.js`
so the exposed portal stays out of search results.

**broke** — `/robots.txt` returned a 307 to `/login`. The auth gate matched it
like any other route, so no crawler could ever read the file telling it to stay
away. It looked correct in the source and was inert in practice.

**rule** — anything meant to be read by an unauthenticated client must be in the
middleware's exempt list: `robots.txt`, and the same reasoning already applied to
`/login` and `/api/login`. Test public files by fetching them **without** a
session; fetching as yourself hides the bug because your cookie makes it work.

The header is the belt and the file is the braces: `X-Robots-Tag` covers crawlers
that ignore robots.txt, robots.txt covers the ones that read it before requesting
anything. Neither affects the root domain — search engines judge subdomains
separately, so this host being hidden, or offline whenever the laptop sleeps,
costs coderfact.com nothing.

## Put the resource guard before the thing that costs money, not before the render

**tried** — adding an R2 storage ceiling so renders refuse when the bucket is
nearly full. First placement was just before the Remotion call, which felt like
"before the expensive part".

**broke** — in `renderBrief` the expensive part is not the render. The order was
`compileBrief` (an **AI call that spends real money**) → `prepare` → guard →
render. So a full bucket would still have billed a script compile before
refusing. Found only by running it against a real brief and watching
"compiling brief..." print before the refusal.

**rule** — a guard belongs at the top of the function, ahead of the FIRST thing
that costs anything: money, an API quota, or minutes. Ask what the first
irreversible spend is, not what the slowest step is; in an AI pipeline those are
rarely the same step.

Two related traps from the same change:
- **The same anchor existed in two functions.** `const outDir = path.join(...)`
  appears in both `renderScript` and `renderBrief`, so a `replace(..., 1)` put
  the guard in the wrong one and `produce` — the path that actually matters —
  was left unguarded. Assert the match count before replacing; a silent
  `str.replace` that matches nothing, or the wrong one, is worse than an error.
- **Make the threshold env-tunable so the guard is testable.** `R2_CEILING_GB`
  exists so the block can be proven with 1.5MB of data instead of by actually
  storing 9.5GB. A guard nobody can trigger on demand is a guard nobody has
  verified.

## Object-scoped R2 tokens cannot set bucket lifecycle

**tried** — setting a 48h expiration rule through the S3 API with the same token
used for uploads.

**broke** — `403 AccessDenied`. Lifecycle is a **bucket-level** operation
requiring an Admin token; the token here is scoped to *objects*, which is the
narrower and safer scope deliberately chosen because this Cloudflare account also
serves a live website.

**rule** — do not widen a credential to make one setup call succeed. The right
trade was to keep the narrow token and set the rule once in the dashboard, so
`putLifecycle()` now fails with the exact dashboard path instead of an opaque
403, and `getLifecycle()` returns `{unknown:true}` rather than throwing so
`r2 status` still works. Retention is enforced twice for a reason: the bucket
rule survives the laptop being off, and `factory r2 prune` is exact and immediate
when it is on. Neither alone covers both cases.

## Two collectors need a merge, not a copy — and check the data shape first

**tried** — syncing cloud-collected trends by replacing the local file with the
remote one, guarded by "refuse if local is bigger" so a smaller remote could not
clobber accumulated history.

**broke** — the guard fired on the very first real sync, and it was right to, but
the whole model was wrong. Actual numbers: local 497 trends, remote 292, only
**271 shared**. Each side held records the other did not — 226 local-only, 21
cloud-only. Copying in *either* direction destroys real data. "Bigger is
authoritative" is not true once two collectors run independently.

**rule** — when the same store is written from two places, the reconcile is a
**union**, not a choice. `trends` is a map keyed by id, so this was always
possible; I just never looked at the shape. The tell was sitting in the output
the whole time: item counts printed as `? items` because the counter assumed
`trends` was an array when it is an object. **An unexplained `?` in your own
diagnostic is a bug report — chase it before trusting anything else the tool says.**

Merging records needs domain thinking, not `Object.assign`:
- `first_seen` takes the **earliest**, `last_seen` the **latest**. Velocity is
  derived from how long an item has been observed, so widening that window with
  the other side's sightings is the entire point of syncing. The merge widened
  271 records and velocity coverage went 153 -> 158.
- `used` and `alerted` OR together. Work already done on either side must never
  be un-marked by a sync.
- Assert the invariant afterwards: `first_seen > last_seen` must be 0. It is the
  cheapest possible check that the merge did what you think.

Related Windows trap hit while debugging this: Git Bash rewrote
`git show origin/master:.github/...` into `origin\master;.github\...`, producing a
confident but false "file is MISSING on master". Set `MSYS_NO_PATHCONV=1` for git
revision:path arguments, and when two checks of the same fact disagree, suspect
the tooling before the repo.

## The ops portal cannot move to Workers — build beside it, not instead of it

**tried** — promising an "always-on portal" as a one-file change, on the basis
that 34 of 37 API routes call helpers from `lib/factory.js` rather than touching
the filesystem directly.

**broke** — that reading was wrong. **30 of the 37 routes import `node:` builtins
themselves** (`fs`, `path`, `child_process`), which the Cloudflare Workers runtime
does not provide. `lib/factory.js` is the single *execution* boundary, not the
single *Node* boundary, and those are different things. Porting would have meant
rewriting 30 routes and maintaining local and cloud builds of the same app —
against the standing "don't break existing functionality" constraint.

**rule** — before claiming a port is small, grep for the RUNTIME dependency
(`from "node:`), not the architectural one. A tidy internal seam says nothing
about which primitives the leaves reach for.

What worked instead: a separate read-only static page generated from R2 and
deployed to Pages, reusing the existing `listObjects`/`presignGet`/`usage`
functions and touching none of the 37 routes or 27 pages. Read-only is a
security property here rather than a limitation — the URL is meant to be shared,
and the ops portal can run 46 commands on the host.

Three details worth keeping:
- **Bake presigned URLs into the HTML.** Fetching R2 from the browser would need
  either a public bucket (which needs a domain, so a DNS record) or CORS on a
  signed API. Baking them in needs neither, so the bucket stays private. Links
  last 7 days and retention deletes at 48h, so the video always expires first.
- **Deploy with `--project-name` and no wrangler config.** A `wrangler.*` file in
  this repo reusing the name `coderfact` would overwrite the portfolio Worker on
  deploy. There is still no wrangler config here, and there should not be one.
- **A truncated download in a test is usually the test.** Checking the baked link
  first returned 12KB of a 1.4MB video and looked like a real bug; the cause was
  my own regex extraction plus incomplete `&amp;` unescaping. Extracting it with
  a real HTML parser gave HTTP 200 and all 1,425,841 bytes. `&amp;` in HTML source
  is correct — browsers decode it.

## Pages Functions are found relative to the WORKING directory, not the asset dir

**tried** — `wrangler pages deploy data/viewer --project-name=...` with the
function at `data/viewer/functions/api/request.js`.

**broke** — the deploy succeeded, uploaded the assets, and silently produced no
Function. `/api/request` returned the static index.html instead of JSON. Nothing
in the output said a function had been skipped; the absence of "Compiled Worker
successfully" was the only signal, and absence is easy to miss.

**rule** — wrangler 4.x auto-detects `./functions` relative to the **current
working directory**, not the asset directory passed as an argument, and there is
no `--functions-directory` flag any more. `cd` into the deploy directory first:
`cd data/viewer && wrangler pages deploy .`. Then the output reads "Compiled
Worker successfully" and "Uploading Functions bundle" — check for those two lines
rather than trusting "Deployment complete".

Two neighbouring traps from the same piece of work:
- **A Pages deploy defaults to a PREVIEW branch.** The first deploy went to
  branch `master` while the project's production branch was `main`, so the stable
  `*.pages.dev` root 404'd while a hashed preview URL worked fine. Pass
  `--branch=main` (or set the production branch) or the shareable URL is dead.
- **Generated output directories are gitignored.** The function source initially
  lived in `data/viewer/functions/`, inside a gitignored tree — it would have
  vanished on a clean checkout. Source belongs in `packages/`, copied into the
  deploy directory at build time.

## Measure the encoder, do not assume the software one is better

**tried** — accepting `libx264 -preset veryfast -crf 19` as the encoder
everywhere, and reaching for faster x264 presets when long-video timings looked
bad.

**broke** — nothing was broken, but a ~2x speedup was sitting unused. This
machine is an **i3-7020U: 2 cores, 15W**, so x264 is fighting for the only CPU
there is — while the HD Graphics 620 has Quick Sync sitting idle, and ffmpeg
already had `h264_qsv` compiled in.

Measured, 63s of 1080p, SSIM against the source:

    x264 veryfast crf19   SSIM 0.998603   1.88x   4.22MB   <- was the default
    QSV global_quality 21 SSIM 0.998571   3.85x   5.48MB
    QSV global_quality 18 SSIM 0.998847   3.66x   6.77MB   <- chosen
    x264 ultrafast        (not measured for SSIM)  3.40x  24.67MB

**rule** — benchmark the encoder on the actual hardware before optimising
settings. The obvious lever (a faster x264 preset) was the worst option:
`ultrafast` was SLOWER than hardware encoding *and* produced a 4.6x larger file.
gq18 is both faster and higher quality than the previous default, so this was not
a quality trade at all — but that only became knowable by measuring.

Details worth keeping:
- **SSIM, not file size.** Bigger output looked like worse value until measured;
  gq18 is larger *and* closer to the source. VMAF would be the better metric but
  is unusable here — it timed out after 7 minutes on a 63s clip on 2 cores.
- **Check `pix_fmt` and `color_range` after switching encoders.** QSV can emit
  full-range `yuvj420p` where x264 emits limited `yuv420p`, which shows up as a
  washed-out or crushed picture. Verified here: source and output are both
  `yuvj420p pc bt470bg`, so the range was preserved.
- **Probe, do not trust `-encoders`.** `h264_qsv` is listed on essentially every
  Windows ffmpeg build and fails at runtime without the Intel driver. Detection
  encodes one real frame, and falls back to x264 — mandatory, because GitHub
  runners have no iGPU.
- **The indirect win is bigger than the number.** On 2 cores, moving encoding to
  the iGPU stops it competing with whisper for the only CPUs available.

## A cold-start measurement is not a benchmark

**tried** — timing whisper on a 63s clip and extrapolating: 0.86x realtime, so a
60-minute video would need ~70 minutes just to transcribe. Reported that.

**broke** — that first run **downloaded the model**. Warm, the same command runs
at **3.38x realtime** — a 60-minute video transcribes in ~18 minutes, not 70. The
alarming conclusion was an artifact, and it also made four timeouts look
dangerous when only two actually were.

**rule** — discard the first run of anything that fetches a model, fills a cache,
or JITs. Run it twice and use the second. `--compute_type int8` then measured as
no change at all, because ctranslate2 already defaults to int8 on CPU — another
thing the cold-start noise would have hidden.

## "Nothing here yet" and "it is broken" look identical

**tried** — shipping a public page that lists finished videos, on the assumption
that seeing the files was what someone waiting actually needed.

**broke** — nothing technically, but the page could not answer any of the
questions a person actually has: is my request being worked on? is the laptop
even on? when will it run? An empty list reads exactly like a broken system, and
the natural response is to refresh every thirty seconds or ask the owner — which
is the dependency the whole queue existed to remove.

**rule** — an asynchronous system owed to someone else needs a STATUS surface,
not just a RESULTS surface. The laptop now writes a heartbeat to R2 at four
points (awake / working / idle-empty / idle-done) and the page reads it live, so
it can say "asleep, 2 waiting, next run at about 07:30 pm (in 2h 30m)".

Things that made the messages actually useful:
- **Name the job and give it a duration.** "Making \"why 0.999 = 1\" now —
  started 4 min ago, these usually take about 11 min" answers the real question.
  "In progress" does not. The ETAs come from measured job history, not guesses.
- **Treat a stale heartbeat as asleep.** A crash mid-job leaves `state:"working"`
  written forever; without a staleness window the page cheerfully reports work
  that stopped hours ago. 20 minutes, then it reads as asleep.
- **Do NOT clamp timestamp deltas with `Math.max(0, ...)`.** It makes a FUTURE
  timestamp read as "just now", so clock skew or a bad write reports a dead
  machine as healthy. Caught by testing a skewed beat explicitly; the guard is
  now a two-sided window.
- **Degrade to the useful half.** With the R2 binding missing the banner shows
  "Status unavailable — the video list below still works", and the videos,
  download links and request form all still function. Verified in a browser
  against the live deployment.

## The header claimed "go back to sleep"; the code never did

**tried** — writing `wake-and-drain.ps1` with a header block opening
"Wake on a schedule, drain the queue, go back to sleep."

**broke** — the script waked and drained. Nothing in it slept. The only thing
that would eventually suspend the machine was Windows' own 30-minute idle
timeout, so a 1-minute brief job left the laptop awake for half an hour — the
opposite of the "less laptop usage" this was built for. The comment was aspiration
written at the same time as the code, and it read as documentation afterwards.

**rule** — grep your own comments against your own code before trusting either.
`grep -nE 'sleep|suspend' wake-and-drain.ps1` returned six hits and every one was
a comment. A doc block describing intended behaviour is indistinguishable from
one describing real behaviour, and the second is the only kind worth having.

Sleeping turned out to need real guards, not a bare suspend call:
- **Someone at the keyboard.** Waking at 14:00 to run a job while its owner is
  using the machine, then suspending it under them, is hostile. `GetLastInputInfo`
  gives real idle time.
- **cloudflared running.** That means the portal is deliberately being served;
  sleeping kills factory.coderfact.com. Verified this fires — the dry run refused
  for exactly this reason.
- **Work still running.** ffmpeg/whisper alive means the drain is not done.
- **`disableWakeEvent` must be FALSE** in `SetSuspendState`. Setting it true
  suspends the machine and disarms the next scheduled wake, stranding the queue
  permanently — a bug that would look like "the laptop just never woke up again".

Chain it with `&`, not `&&`: the machine must still sleep when a job FAILED,
otherwise one bad render leaves it awake indefinitely.

**PowerShell escaping trap while doing this:** inside a double-quoted PowerShell
string the escape character is a BACKTICK, not a backslash. `\"` produced
"Unexpected token" errors; `` `" `` is correct. And verifying it by reconstructing
the command through bash -> powershell -Command adds another quoting layer that
fails on its own — extract the real lines from the real file and run those instead.

## Big files belong on disk, not through a browser

**tried** — routing all footage through the portal's upload endpoint, since that
was the answer for "the portal is remote now, D:\footage\take1.mp4 means nothing".

**broke** — it is the wrong tool above a certain size. A 300MB+ capture over a
home connection takes longer than the edit itself, and the laptop has to stay
awake for the whole transfer, which is exactly the dependency the queue was built
to remove. Upload is right for a phone clip and wrong for a long capture.

**rule** — offer a filesystem drop folder alongside the upload, pointing at the
SAME directory (`data/footage/`) so both routes converge and nothing downstream
needs to know which was used. Copying over a network share, from a USB stick, or
straight off a camera moves the same bytes with no browser and no size ceiling.

The security detail that matters: a queue entry stores a **basename only**, and
`resolveInInbox()` re-validates it at run time — the file may have been deleted
since queueing, and without the check a queued job is a way to point the pipeline
at any file on disk. Verified refusals: `../../.env`, `..\..\.env`,
`C:/Windows/System32/calc.exe`, `subdir/x.mp4`, non-video extensions, and
missing files. Re-validating at RUN time rather than only at QUEUE time is the
part worth copying — the two moments can be hours apart.

Small thing that mattered: the first estimate printed "~0 min of laptop time" for
a 43s clip. A progress estimate that rounds to zero reads as broken; it now says
"under a minute".

## Auto white balance is wrong for beauty footage — built it, measured it, removed it

**tried** — replacing a fixed grade (`eq=contrast=1.05:saturation=1.08`) with one
derived from the footage: sample with ffmpeg `signalstats`, then correct
exposure, contrast and white balance from measured YAVG/UAVG/VAVG/SATAVG.

**broke** — twice, and only testing found either.

1. **`colorbalance` was a NO-OP.** Measured U/V identical to one decimal across
   `bm=0.06`, `0.15` and `0.30` — a 5x strength range. The pipeline was
   computing a correction, printing it in the notes, and changing nothing. A
   grade that reports work it did not do is worse than no grade, because the
   log says the problem was handled.

2. **Grey-world is the wrong model for skin.** Auto-WB from frame averages
   assumes an average scene is neutral. A beauty close-up is not an average
   scene: a correctly lit, correctly balanced skin plate measures **U 110 /
   V 150**, because skin genuinely is warm and 128/128 is grey. The code read
   correct skin as a "cast towards yellow" and prescribed
   `rm=-0.175:bm=0.138` — which would have drained the warmth out of accurate
   skin. I had built a colour-accuracy feature that destroyed colour accuracy on
   the one vertical it existed for.

**rule** — correcting colour without a reference (a grey card, or knowing which
pixels are skin) is guessing, and on work where colour IS the product, guessing
is exactly what to avoid. Removed it; exposure correction stays because luma has
no such ambiguity. Shipping less that is right beats shipping more that is wrong.

Two habits this reinforced:
- **Verify a filter actually changes the output**, not just that ffmpeg accepted
  it. Exit code 0 and a plausible filter string prove nothing. Measure before
  and after, and sweep the strength — a flat response across 5x is the tell.
- **Test with representative material.** Three separate wrong conclusions came
  from testing on convenient footage: a dark Manim render (no midtones for a
  cast to live in), then `testsrc2` colour bars (saturated primaries, almost no
  midtones either). Only a skin-tone plate showed the real behaviour. For a
  beauty feature, test on something skin-coloured.

Also fixed while here: the underexposure threshold was `yavg < 70`, so a clip
measuring exactly 70 reported "exposure fine". Now 85, with the 25 floor kept so
deliberately dark footage (a Manim short measures ~17) is still left alone.

## signalstats reports in the source bit depth, not 0-255

**tried** — deriving exposure correction from ffmpeg `signalstats` YAVG, treating
it as 0-255 because that is what 8-bit video reports.

**broke** — on a real DJI clip the pipeline printed
`overexposed (mean luma 559/255) - pulled down 6.0%`. 559 out of 255 is
impossible, and the absurd number was the only visible symptom of a real defect:
the file is **10-bit** (`yuv420p10le`), signalstats reports on 0-1023 for it, and
559/1023 is 139 in 8-bit terms — perfectly normal exposure. The grade darkened
correctly-exposed footage by 6% and reported it as a fix.

**rule** — normalise measurement output to one scale at the point of
measurement, before any threshold sees it. `analyzeFootage` now reads `pix_fmt`,
derives the depth, and scales every channel by `255 / (2**depth - 1)`. This is
not an edge case: DJI, iPhone and most current cameras shoot 10-bit by default,
so the naive version was wrong for the majority of real camera footage while
being right on every test file I had generated with x264 defaults.

**A nonsensical number in your own output is a bug report.** "559/255" was
printed to the console on a successful run and could easily have been skimmed
past — the run exited 0, produced a video, and uploaded it. Ratios that exceed
their own stated maximum deserve a stop, not a scroll.

## Zero pauses is not a harmless miss — it silently disables the whole edit

**tried** — shipping the auto-editor and trusting its output because it exited 0
and produced a video.

**broke** — a real 93-second DJI clip produced `0 pauses + 0 fillers -> 1 cuts`,
and the user reported the result as "value less: no transitions, no effects,
nothing". They were right, and the cause was one bug with a wide blast radius:
ONE segment means no cuts, and no cuts means no transitions and no punch-ins,
because both alternate across segment boundaries. The edit degrades to "the
original clip with fades on it" and reports success.

**Three separate defects, all in `detectSilences`:**

1. **`aformat=sample_fmts=s16` was missing — the real one.** AAC decodes to
   float, and both `afftdn` and `silencedetect` behave differently on float than
   on s16. Identical audio: **0 pauses as float, 7 as s16.** This meant silence
   detection was quietly broken for every AAC source — which is every camera
   file. It only ever looked correct because my own test clips were made by
   extracting to PCM WAV first.

2. **Denoise ran too late.** The export chain denoised, but detection ran on raw
   audio. On constant wind/handling noise the floor never drops, so nothing
   registers as silence. Denoised first: 7 pauses at -30dB, 24 at -25dB.

3. **A fixed -35dB threshold is meaningless.** Her noise floor measured -24.2dB,
   so -35dB was below it and unreachable. The threshold is now derived from a
   measured floor (`floor - 6dB`).

**rule** — when a stage reports "found nothing", treat that as a claim to verify,
not a result to pass along. Nothing-found and broken-detector are the same
output, and the one that produces a plausible video is the dangerous one.

Related: **`-vn` when analysing audio.** The old call decoded the entire HEVC
video to read its audio track — 44 seconds versus 1 second with `-vn`.

## Small whisper models are English-biased — an explicit language is not optional

**broke** — whisper correctly auto-detected a Bengali clip as `bn`, then emitted
English-looking nonsense: 3 segments for 93 seconds of continuous speech, reading
"Lafante.js, Remotion, Manim and CoderFact". The captions were confidently wrong
rather than obviously absent, which is worse.

**rule** — auto-detect identifies the language but does not make a small model
competent at it. Non-English work needs BOTH an explicit `--language` and a
larger model; `base` is not usable for Bengali. `FACTORY_LANGUAGE` now passes the
language through, and the run prints which language and model it used so a bad
transcript is traceable instead of mysterious.

## xfade offsets are cumulative AND shrinking

**tried** — adding crossfades between the segments an auto-edit produces, having
previously used plain `concat` (hard cuts only, with fades just at the very start
and end — which is what made the output read as "raw clip with the quiet bits
removed").

**broke** — nothing shipped broken, because the offset arithmetic was checked
against measured output. It is the part worth writing down, since getting it
wrong fails in a way that looks fine at first:

  - `xfade` OVERLAPS its two inputs, so each transition removes `dur` seconds
    from the total. Segment i must start at
    `(sum of previous durations) - (i * dur)`, not at the running sum. Using the
    naive sum drifts by `dur` per cut: invisible on the first transition,
    obviously broken by the fourth.
  - Audio needs `acrossfade` at the SAME duration, or audio ends up
    `(n-1) * dur` longer than video — a slow desync rather than an error.
  - A transition longer than half a neighbour eats the whole segment, so it is
    clamped per pair, and anything under 0.08s becomes a hard cut. Dissolving a
    0.4s clip leaves none of it on screen.

Verified rather than assumed: 5 segments totalling 90.10s with 4 x 0.3s
transitions predicts 88.90s. Actual video 88.86s, audio 88.90s, **A/V drift
0.045s**. Check the drift, not just that ffmpeg exited 0.

## Cloud transcription is the one place footage leaves the machine

Groq's hosted whisper large-v3 fixes what local `base` cannot (Bengali) and
takes seconds where local large-v3 would take ~2.9 hours for a 60-minute video
on this CPU. Worth having — but it is the ONLY step in this project that sends
anything off the machine, and everything else is local by construction.

So it is gated three ways rather than being a config value someone finds later:
requires `GROQ_API_KEY` **and** the transcribe tier set to `best`; uploads
**audio only, never video**; and prints what it is doing on every single run.
Someone filming another person deserves to know their voice is being sent
somewhere, and a setting buried in a file is not knowing.

Failure falls back to local and says so. A silent downgrade would mean captions
quietly getting worse with no signal.

## Only self-contained jobs can move to the cloud first

**tried** — planning to move rendering to GitHub Actions now that the repo can
be public (unlimited minutes).

**broke** — most jobs cannot go yet, and the reason is state, not compute.
`brief`, `produce` and `edit` all read local `data/` collections that are not
synced anywhere: `factory-data` carries only `trends.json`. A render workflow for
those would need the whole store mirrored first.

**rule** — when moving work to a new environment, order the jobs by how much
local state they depend on, not by how slow they are. `factory math "<topic>"`
needs nothing but a string: it writes its own Manim scene, renders it, and is
done. It also happens to be the most expensive local job (~11 min measured), so
the self-contained one and the valuable one are the same job. Start there and the
first cloud run proves the path without also debugging a state sync.

Two environment differences worth encoding rather than discovering:
- **Runners have no Intel iGPU**, so `FACTORY_FORCE_X264=1` is set explicitly.
  `encoder.js` probes by encoding a real frame rather than trusting
  `-encoders`, so this is belt-and-braces — but a workflow that silently fell
  back would be indistinguishable from one that was slow for another reason.
- **A runner's disk is deleted when it exits.** Without R2 configured the video
  simply vanishes, so the workflow uploads an artifact as a fallback and says
  plainly in the summary which of the two happened. A render that succeeded and
  then evaporated is the worst possible outcome.

Also: rendering needs `npm ci` in `renderers/code-report` (Remotion, React) and
apt `libcairo2-dev libpango1.0-dev` for Manim. Radar needed neither, which is why
the collect workflow skips install entirely — the two are not interchangeable
templates.

## A setting somebody has to be told about is not a setting

**tried** — adding transcription language as `FACTORY_LANGUAGE`, an environment
variable, because that was the quickest way to make the pipeline honour it.

**broke** — nothing technically, but it was the wrong home. The whole point of
the language option is that whisper's small models are English-biased and get
non-English audio confidently wrong; the person who needs it is the one filming
in Bengali, not the one editing `.env`. An env var is a setting only for whoever
already knows it exists.

**rule** — options that change OUTPUT QUALITY belong in the portal next to the
thing they affect. `.env` is for credentials and machine-specific paths. The
language picker now sits directly above the Transcription tier selector, because
choosing "Bengali" and leaving the tier on `base` produces exactly the garbage
this was meant to prevent — so the UI says so at the point of choosing.

Precedence is env > config > auto-detect: a one-off run can still override
without editing settings, which is what an env var is actually good for.

Validation matters here more than usual: the value reaches a whisper command
line, so it is checked against a known list rather than sanitised. Verified
rejections: `evil`, `; rm -rf /`, `../../etc/passwd`, and a trailing null byte;
`BN` normalises to `bn`. An allowlist is the right shape when the set of valid
values is small and known — sanitising a string you will pass to a subprocess is
a losing game.

## Do not insert into JSX by string-matching — read the structure first

**tried** — adding two settings sections to `settings/page.js` with a Python
script that found an anchor string and spliced JSX in before it.

**broke** — three times, in three different ways:

1. The first insert landed after the LAST line starting with `import `, which
   was `import {` — the opening line of a MULTI-LINE import. Result:
   `cannot import as reserved word`, because the new statement was spliced into
   the middle of another one.
2. Both `<section>` blocks landed AFTER the component's closing brace
   (`}<section className=...`). They looked present to `grep` — 11 matches for
   "language" — and were outside the function, so nothing rendered and the page
   500'd.
3. That grep count is what made me believe it had worked. Counting occurrences
   proves text exists somewhere in a file, not that it is in the right scope.

**rule** — for structured code, find the insertion point by reading the
structure (where does the component end? where does the return close?), not by
matching a nearby string. `grep -n 'Auto-edit\|^}\|^  );'` took one command and
showed both blocks sitting past line 381's closing brace — the check I should
have run after the first edit rather than the fourth.

**And verify with the thing that actually parses it.** `node --check` does not
understand JSX, so it reported "syntax ok" on a file Next could not compile at
all. The dev-server error log was the only source of truth, and it named the
exact line both times.

Related: an env var set in the middle of testing (`FACTORY_LANGUAGE=hi`) leaked
into later assertions in the same process. Delete it explicitly rather than
assuming the next call starts clean.

## Groq and Grok are different companies

**tried** — the user asked to "add the grok staff" for transcription, and I built
against **Groq** (groq.com), which hosts whisper-large-v3 on a free tier.

**broke** — the key they added starts `xai-`, which is an **xAI** key. xAI makes
the **Grok** chatbot; Groq is an inference-hardware company. The names differ by
one letter and one is a homophone of the other. Confirmed rather than assumed:
`api.groq.com/openai/v1/models` returned `401 Invalid API Key`.

The distinction matters beyond the key prefix: **xAI has no speech-to-text
endpoint at all**, so this is not a matter of pointing at a different URL. Grok
is text and vision; there is nothing to transcribe with.

**rule** — when a product name is ambiguous, verify the credential against the
API before building on it, and say which company you mean in the setup docs.
`.env.example` now names "console.groq.com" explicitly and states that keys start
`gsk_`, because "add your Groq key" is exactly the instruction that produced an
xAI key.

## needs() predicates read process.env — which nothing had loaded

**broke** — with a key present, `resolveService('transcribe', {transcribe:'best'})`
still resolved to the LOCAL model. The tier options gate on
`needs: () => Boolean(process.env.GROQ_API_KEY)`, and this repo does not
auto-load `.env` — each entry point calls `loadEnv()` itself. Nothing had, so
every key-dependent tier was invisible and silently degraded to a lesser option.

This is the **third** instance of the same root cause: R2 reported "not
configured" with a correct `.env`, and the same bug was latent in the whole tier
system. It only looked fine in tests because those called `loadEnv()` explicitly.

**rule** — if a module's behaviour depends on `process.env`, it must ensure the
environment is loaded itself rather than trusting a caller to have done it. Fixed
with a memoised `ensureEnv()` in `tiers.js`, matching `r2.js`. A silent downgrade
to a worse option is the worst failure shape available: it produces output, so
nothing reports a problem.

## Groq rejects WAV and opus with a bare 500

**tried** — uploading 16kHz mono opus to Groq's transcription endpoint, chosen
because it is the smallest format whisper can use losslessly.

**broke** — `500 Internal Server Error`, with nothing in the message about
format. Isolated by holding the audio and every parameter constant and varying
only the container:

    wav                 -> HTTP 500
    opus in ogg         -> HTTP 500
    mp3                 -> HTTP 200

**rule** — a 500 from a third-party API is not necessarily your bug, but it is
worth one bisect before assuming so. Switching the container fixed it, and MP3
at 32kbps mono is also 7x smaller than WAV (93 seconds: 0.4MB vs 2.8MB), which
matters against the 25MB upload cap.

The payoff, on the footage that started all of this: local `base` produced 3
segments of English nonsense ("Lafante.js, Remotion, Manim and CoderFact") from
93 seconds of Bengali. Groq returned **151 words, 19 segments, in 7 seconds**,
in actual Bengali script.

## Two companies, one letter apart, both wired in now

`GROQ_API_KEY` (gsk_) is Groq — transcription only. `XAI_API_KEY` (xai-) is xAI
— LLM only. They do not overlap and neither substitutes for the other. The user
supplied an xAI key when asked for a Groq one, which cost a round trip; both
`.env.example` blocks now name the company, the domain and the key prefix
explicitly, and cross-reference each other.

xAI slots in as the FIRST option in the `cheap` tier rather than `free`, because
it is paid — a paid option in a tier labelled free would quietly spend money.
Verified the free tier is unchanged and xai leads cheap only when the key exists.

## What kept jobs laptop-only was STATE, not CPU

**tried** — assuming briefs, edits and renders could not move to the cloud
because they are heavy.

**broke** — the assumption. They were laptop-only because they read
`data/os/*` — briefs, clusters, publishitems, scripts — which existed on one
machine. Measured: **71 JSON files, 3.3MB.** That is the entire reason those
jobs could not run anywhere else. Math shorts moved months' worth of CPU to the
cloud only because they happen to need no state at all.

**rule** — when something "cannot" move to another environment, separate the
compute reason from the data reason before accepting it. Here the data was
trivial to move and the compute was never the obstacle.

Footage is the genuine weight (436MB) and is synced per file, on demand, only
for the jobs that need it. R2's zero egress means the runner's download costs
nothing, which is what makes this viable at all.

The step that is easy to omit and expensive to forget: **push state BACK after
the cloud job.** Decisions made on a runner — a brief marked used, a new publish
item — exist only there until pushed, and the laptop's next pull would silently
overwrite them with older local state. `if: always()` so it happens even when
the job failed.

## Split reading from executing, and the always-on problem dissolves

**tried** — treating "make factory.coderfact.com available 24/7" as a hosting
question, and repeatedly concluding it could not be done without either keeping
the laptop awake or renting a server.

**broke** — the framing, not the facts. The portal cannot move to Cloudflare
because 30 of its 37 routes spawn ffmpeg, Chrome, Manim or whisper, and Workers
has no `child_process`. All of that is true and stays true. But it only applies
to EXECUTING. Reading the factory's state needs none of it: briefs, clusters,
publish items and scores are 71 JSON files totalling 3.3MB, and they are already
synced to R2.

**rule** — when something "cannot be always-on", separate the read path from the
write path before accepting it. Here the answer was not one portal in a better
place; it was two surfaces with different requirements — execution stays on the
machine that has the binaries, information lives on a static page backed by
object storage, always on and free.

Worth noting how long that took to see: the same constraint had been restated
several times across the session as though it were one indivisible problem.

Practical trap this exposed: R2 credentials are needed in THREE separate places
and none of them implies the others - the local `.env`, GitHub Actions secrets,
and a Cloudflare Pages binding. "I added the R2 keys" was true for two of the
three, and the third failed with a message that did not obviously mean
"different place".

## Queue the laptop-bound work instead of hiding it

**tried** — treating "the portal must be always available" as a hosting problem
with three answers: keep the laptop awake, rent a server, or accept a read-only
page.

**broke** — all three were wrong because they assumed the portal is one thing.
It is two: a surface people look at, and a machine that spawns ffmpeg. Splitting
them gives a fourth answer that is better than any of the three — the surface
lives on Pages (always up, free), and the 25 of 76 commands that genuinely need
the laptop are QUEUED with a message saying when they will run.

**rule** — when a capability cannot be available, check whether it can be
*deferred* instead. "Queued, runs at about 20:00" is a working feature. A greyed
out button is not, and neither is a portal that returns 530.

Two things that made this safe rather than clever:
- **A queue entry carries a registry KEY, never a command line.** The laptop
  rebuilds argv from its own registry when it drains, so a public write surface
  can request a video about a rude topic but cannot request a shell.
- **The registry is published to R2 as data on every `sync push`.** Workers
  cannot import the repo's ESM, and a hand-maintained copy would drift — a
  button that appears and then fails is worse than a missing button.

Cost of the region rewrite that enabled this: deleting a block of a file to
replace it also deleted `PREFIX`, `STATES`, `keyFor` and `newId`, which lived
between the two functions being replaced. Syntax checked fine; it failed at
runtime on the first call. When cutting a range out of a file, list what was in
the range before deciding the range is what you meant.

## One portal, and laptop jobs QUEUE rather than disappear

**tried** — splitting the factory across two hostnames: an always-on read-only
page, and `ops.` for the real portal when the laptop happened to be awake.

**broke** — the framing, again. Two addresses meant remembering which one did
what, and `ops.` was down most of the time by design. What was actually wanted
was ONE address that is always up, shows everything, and is honest about what
has to wait.

**rule** — when a capability is unavailable right now, queue it and say WHEN,
rather than hiding it or greying it out. "Render the demo is queued. It needs the
laptop, so it will run at about 20:00 (in 1h 43m). 3 jobs ahead of it." is more
useful than a disabled button, and it removes the second hostname entirely.

The safety property survives the move to a public endpoint unchanged: the client
sends a registry KEY, never a command line. The key is checked against a manifest
published by `sync push`, and argv is rebuilt on the laptop from that key alone.
Verified against the live endpoint - `{"cmd":"; rm -rf /"}` returns
`unknown command`, and a missing argument returns
`Brief a specific idea needs Topic or angle` rather than queueing something
broken.

**Do not trust a derived timestamp from a stale record.** The first version read
`nextWake` straight from the heartbeat and produced "at about 03:30 (in 0 min)" -
that value had been computed 26 hours earlier and was long past. `wakeTimes` is
the durable fact; the next occurrence has to be recomputed at read time. Same
class of bug as clamping a negative age to zero: a stale derived value looks like
a fresh one unless something checks.

## `node --check` is not a syntax gate for App Router routes

*Tried* — after porting 30 route files, ran `node --check` over every one, got
"all 37 routes ok", and treated that as proof the code parsed.

*Broke* — the first real build failed on
`String(body.briefId || body.id ?? "")`. Mixing `||` with `??` without
parentheses is a SyntaxError, and swc rejects it. `node --check` returns exit 0
on the same file. Nine routes had shipped that pattern past a green check,
because the port template that generated them contained it.

*Rule* — **the build is the only syntax gate.** `node --check` disagrees with the
bundler's parser, so a green check means nothing about whether Next will compile
it. A second-order lesson from the same session: the first check loop piped node
into `head`, so `$?` was head's exit code and every file "passed". If a check
loop reports zero failures across dozens of files on the first attempt, verify
the loop can actually fail before believing it.

## Audit by capability, not by import string

*Tried* — found every route that needed porting to Workers with
`grep -rl '^import.*node:' app`, drove it to zero, and called the port complete.

*Broke* — `vercel build` failed with "Unable to find lambda for route:
/api/renders". Seven routes imported `lib/factory.js`, which imports `node:fs`
itself. They had no `node:` string of their own, so the grep never saw them.

*Rule* — grep finds direct imports, not transitive ones. The honest audit
question was never "which files say `node:`" but **"which files still reach the
disk"** — answered by grepping for the *module* that does it. Same shape as the
`runtime = "edge"` audit: the property that matters is what a route can do, and
the import line is only one symptom of it.

## Windows cannot finish a Vercel build, and that is fine

*Tried* — building the Pages bundle locally, repeatedly.

*Broke* — `vercel build` deduplicates identical functions with symlinks, and
Windows refuses `fs.symlink` without Developer Mode. The Next build compiles
100% clean and then dies with `EPERM: symlink`. Worse, each aborted run leaves a
partial `.vercel/output`, so `next-on-pages` then reports whichever routes had
not been emitted yet as "not configured to run with the Edge Runtime" — false
positives that change every run and look exactly like real errors.

*Rule* — on Windows, trust the **compile** result locally and get the edge-runtime
verdict from CI. When reading a next-on-pages runtime complaint, first check
whether the build that produced the output actually finished; only a complaint
from a completed build is real. `/_not-found` was the one true finding, and it
needs `app/not-found.js` to exist, because Next's generated version does not
inherit `runtime` from the root layout.

## A Windows-built Cloudflare bundle deploys and then 500s

*Tried* — building the Pages bundle on Windows once the symlink problem was
worked around, deploying it, and treating a green build as a working portal.

*Broke* — every page answered 500 with "Could not find the module <id> in the
React Server Consumer Manifest", while the API routes worked perfectly. The
build printed no warning; the failure only exists at runtime. The same commit
built in Linux CI works completely.

*Rule* — **the adapter's "not reliable on Windows" warning means the artifact,
not the build.** Never judge a Cloudflare bundle by whether it built. Build in
CI and deploy that exact tarball (`node scripts/deploy-portal.mjs`). The tell
that something is path-related: the build log printed
`_worker.js\nop-build-log.json`, where a Windows separator had been read as an
escape.

## An unanchored .gitignore rule hid two source files for months

*Tried* — trusting that a page working locally meant it was in the repository.

*Broke* — the first deploy from a clean CI checkout answered 404 on `/renders`
and `/api/renders` while the other 24 pages worked. `.gitignore` line 12 was
`renders/` — no leading slash — so besides the repo-root output directory it
also matched `app/renders/` and `app/api/renders/`. Those two files had never
been committed. Nothing noticed because the local portal reads the working tree.

*Rule* — **anchor ignore rules for build output: `/renders/`, not `renders/`.**
And when a deploy is missing exactly one feature, check `git ls-files` before
debugging the bundler. `git ls-files --others --ignored --exclude-standard` over
the source directories lists everything being hidden this way.

## Porting route-by-route silently deletes the readers

*Tried* — porting ~40 API routes one at a time, classifying each by what it
mainly did ("this one runs a command"), and verifying with a page-level sweep
that returned 200.

*Broke* — nine routes lost a handler. Three had their GET deleted, three had it
replaced with a `{note: "POST to run"}` stub, and three writes were dropped
entirely. Every affected PAGE still returned 200 — the shell renders, then its
`useEffect` fetch 405s and the page sits empty. A sweep of page status codes
cannot see this.

*Rule* — when porting a set of endpoints, diff the **exported method sets**
against the pre-port commit, per file. `grep -oE 'export (async )?function
(GET|POST|PUT|DELETE|PATCH)'` on both sides catches in one pass what
route-by-route review misses. Also check for a second handler further down the
file: two `export async function GET` in one module is a duplicate-export
SyntaxError that `node --check` does not report — the same blind spot as the
`||`/`??` case above.

## A page that returns 200 can still be a blank page

*Tried* — verifying the ported portal by sweeping every route's status code.
26/26 pages returned 200, so the port was called done.

*Broke* — two pages were dead anyway. Math Studio queued jobs correctly but
showed a badge reading "undefined" over an empty log, because `useJob`/`JobLog`
read `job.status` and `job.log` while a queue record carries `state` and
`result`/`error`. Settings never rendered at all: it starts with
`if (!config || !env) return "loading…"`, and the ported endpoint had stopped
returning `env`. Both pages are client shells - the HTML renders, returns 200,
and then the fetch underneath disagrees with what the component expects.

*Rule* — **a status-code sweep proves routing, not function.** For a
"use client" app, check the SHAPE the component reads, not just that a response
arrived. Two cheap checks catch this whole class: grep the page for the fields
it destructures off a fetch and confirm the endpoint returns those keys, and
grep for early `if (!x) return "loading"` guards, which turn a missing field
into a permanently blank page rather than an error.

A second-order lesson: when a port changes an operation from synchronous to
queued, it introduces a state the old UI has no word for. "queued" needed
adding to the status vocabulary rather than being folded into "running" - a
spinner for work that starts in five hours is a lie, and mapping it to "done"
would have been worse.

## R2 LIST is eventually consistent; GET by key is not

*Tried* — deduplicating the queue by listing the pending prefix and comparing
each job's command and input against the new one.

*Broke* — clicking Render three times still produced two jobs. Click 1 created
one, click 2 (about a second later) listed the prefix, could not see it, and
created a second; click 3 finally saw it and deduped. The logic was right and
the read was stale.

*Rule* — **in R2, LIST is eventually consistent and GET by key is strongly
consistent.** Anything that must observe a write that just happened has to be a
keyed read, which means the key must be derivable from the request itself — so
dedupe needs a marker object at a deterministic key, not a scan. Store the full
identity inside the marker and compare it on read, so a hash collision cannot
silently merge two different jobs.

A keyed read still is not enough for simultaneous writers: five requests fired
together all read "absent" before any of them wrote. That needs an atomic
create, `put(..., { onlyIf: { etagDoesNotMatch: "*" } })` on the Workers
binding, which returns null to the loser. The loser then re-reads with a short
grace window, because the winner may have claimed the key but not yet written
the job — during that gap the job is genuinely unreadable and still a duplicate.

**The same guarantee is NOT available over R2's S3 API.** `If-None-Match: *` on
a signed PUT was accepted and the object was overwritten anyway — measured, the
second create returned success. So the conditional path exists only on the
binding, and the S3 side was left without a conditional-write option rather than
carrying one that quietly does nothing.

Last thing: a marker scheme only protects rows that HAVE a marker. Jobs queued
before the feature existed had none and slipped straight past the check, which
needed a one-time backfill. Any dedupe keyed on a side-table has this migration.

## Deciding a verdict and recording it must not share a try block

*Tried* — running a queued job and writing its outcome to R2 inside one
try/catch, with the catch calling `fail()`.

*Broke* — a math demo rendered correctly, `renders/math-gauss-sum/short.mp4`
was on disk, and the portal said `failed - fetch failed`. The job never failed.
`complete()` hit a transient network error, landed in the same catch as a
crashed render, and inverted a success into a failure. Nothing in the record
distinguished the two, so the only way to find out was to look for the file.

*Rule* — **the verdict comes from the work; the write is separate and retried.**
A storage error may delay the record or repeat the work; it must never change
what the record says. Anything that reports an outcome over a network needs this
split, and if the write ultimately fails, leaving the job visibly stuck is
better than confidently recording the opposite of what happened.

## A fallback that does not fall back

*Tried* — `chat()` logging `all AI options failed — using the built-in fallback`
and returning null.

*Broke* — there was no fallback. 28 of its 30 callers dereference the result on
the very next line, so an OpenRouter `free-models-per-day` rate limit surfaced
as `TypeError: Cannot read properties of null (reading 'text')` with a stack
trace into llm internals. The actual cause — a daily quota — appeared nowhere.

*Rule* — a message describing a recovery that does not exist is worse than no
message, because it sends the next person looking for a bug in the fallback.
Either implement the degradation or throw with the real reason. When a helper
returns null on failure, check what its callers actually do: if nearly all of
them deref it, the null contract is wrong, not the callers.

Same shape one layer up: `runJob` used `stdio:"inherit"`, showing everything
live and keeping none of it, so a cloud failure reported `exited 1 after 0.4 min`
and nothing else. Live output and a captured tail are not alternatives — the
console reader and the portal reader are different people.
