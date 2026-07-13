# Content Factory

Code-first automated video studio (separate from the portfolio repo — this
must NEVER be deployed to Vercel or imported from portfolio-website).
Node ESM monorepo, plain JavaScript, no TypeScript, no test framework.

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
  fallback), render, math (Manim), clips, autoedit.
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
