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
