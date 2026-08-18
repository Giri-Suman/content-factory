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
