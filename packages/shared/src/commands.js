/**
 * COMMAND REGISTRY — one description of every command, used by the portal.
 *
 * The portal used to reach the CLI through ~20 bespoke API routes, each
 * hardcoding its own argv. That left 17 commands with no portal path at all,
 * and no way to tell which without grepping. This registry is the single
 * source of truth for "what can be run and how", so a new command becomes
 * clickable by adding one row here.
 *
 * `verifyRegistry()` asserts every id is a real CLI command — a registry that
 * drifts from the dispatch is worse than none, because the button appears and
 * then fails.
 *
 * SAFETY: the runner executes ONLY ids in this table. `danger` marks the ones
 * that spend money, write publicly, or delete — the UI confirms those, and
 * `publish --go` is deliberately absent: a real upload stays a deliberate
 * terminal action.
 */

export const CATEGORIES = {
  coding: { label: "Coding", note: "rendered code videos — no camera needed", lane: "hybrid" },
  "ai-automation": { label: "AI automation", note: "agents, workflows, tool reviews", lane: "hybrid" },
  math: { label: "Math", note: "fully automated Manim — needs nothing but a topic", lane: "synthetic" },
  beauty: { label: "Makeup & Nails", note: "you film it; the factory plans, cuts and packages", lane: "capture" },
  all: { label: "Every vertical", note: "works the same whatever you're making", lane: "—" },
};

export const STAGES = {
  find: "Find something to make",
  plan: "Plan it",
  make: "Make it",
  package: "Package it",
  ship: "Ship it",
  learn: "Learn from it",
  ops: "Health & setup",
};

/**
 * arg kinds:
 *   none      no input
 *   text      free text (a topic, a claim)
 *   briefId   pick a brief
 *   renderId  pick a render
 *   file      a path on disk
 *   url       an http(s) URL
 *   choice    one of `options`
 */
export const COMMANDS = [
  /* ---------------- find ---------------- */
  { id: "radar", args: ["collect"], stage: "find", cat: "all", label: "Collect trends", desc: "sweep 17 sources — HN, Show HN, GitHub, Product Hunt, Reddit, newsletters, press", slow: true },
  { id: "score", args: [], stage: "find", cat: "all", label: "Re-score clusters", desc: "group and score without re-collecting", slow: true },
  { id: "evidence", args: ["report"], stage: "find", cat: "all", label: "Evidence report", desc: "which topics actually deserve a video — the one to trust", primary: true },
  { id: "evidence", args: ["quotes"], stage: "find", cat: "ai-automation", label: "Community quotes", desc: "real sentences people wrote, attributed", key: "evidence-quotes" },
  { id: "capabilities", args: ["seasonal"], stage: "find", cat: "all", label: "Seasonal deadlines", desc: "demand that arrives on a date, with publish-by dates", primary: true, key: "cap-seasonal" },
  { id: "capabilities", args: ["seasonal", "makeup"], stage: "find", cat: "beauty", label: "Beauty deadlines", desc: "Diwali, Durga Puja, wedding season — with publish-by dates", primary: true, key: "cap-seasonal-makeup" },
  { id: "keywords", args: [], stage: "find", cat: "all", label: "Keyword gap", desc: "what people search vs what exists", slow: true },
  { id: "ideabank", args: ["rank"], stage: "find", cat: "all", label: "Rank ideas", desc: "your backlog by pillar × effort × freshness" },
  { id: "lab", args: ["extract"], stage: "find", cat: "all", label: "Extract title patterns", desc: "what your winning titles have in common" },
  { id: "yt", args: ["trending"], stage: "find", cat: "all", label: "YouTube trending", desc: "needs a YouTube API key", slow: true },

  /* ---------------- plan ---------------- */
  { id: "brief", args: [], stage: "plan", cat: "all", label: "Brief the top cluster", desc: "hooks, title, beats, caption, blog outline", primary: true, slow: true },
  { id: "brief", args: ["topic"], argKind: "text", argLabel: "Topic or angle", stage: "plan", cat: "all", label: "Brief a specific idea", desc: "type any topic — a seasonal angle, a tool, a question", key: "brief-topic", slow: true },
  { id: "claims", args: ["map"], argKind: "briefId", stage: "plan", cat: "ai-automation", label: "Claims map", desc: "every factual claim and what backs it", primary: true, key: "claims-map" },
  { id: "claims", args: ["audit"], stage: "plan", cat: "all", label: "Claims audit", desc: "unbacked numbers across every brief", key: "claims-audit" },
  { id: "capture", args: ["tool"], argKind: "text", argLabel: "Name and URL, e.g. Cursor https://cursor.com", stage: "plan", cat: "ai-automation", label: "Capture a tool review set", desc: "landing + pricing + docs + mobile screenshots", key: "capture-tool", slow: true },
  { id: "capture", args: ["url"], argKind: "url", argLabel: "URL to screenshot", stage: "plan", cat: "coding", label: "Screenshot a page", desc: "evidence you can put on screen", key: "capture-url", slow: true },
  { id: "capture", args: ["log"], stage: "plan", cat: "all", label: "Capture log", desc: "everything screenshotted so far", key: "capture-log" },
  { id: "catalog", args: ["fanout"], argKind: "briefId", stage: "plan", cat: "all", label: "Fan out", desc: "one brief → carousel, blog, newsletter, Pinterest", key: "catalog-fanout" },

  /* ---------------- make ---------------- */
  { id: "produce", args: [], argKind: "briefId", stage: "make", cat: "all", label: "Produce", desc: "the whole conveyor — routes by vertical automatically", primary: true, slow: true },
  { id: "math", args: [], argKind: "text", argLabel: "Math topic", stage: "make", cat: "math", label: "Make a math short", desc: "LLM writes the Manim scene and renders it", primary: true, slow: true },
  { id: "math", args: ["gauss-sum", "--demo"], stage: "make", cat: "math", label: "Render the demo", desc: "bundled scene, works with no AI key", key: "math-demo", slow: true },
  { id: "edit", args: ["--beauty"], argKind: "file", argLabel: "Path to your footage", stage: "make", cat: "beauty", label: "AI Cut your footage", desc: "silences, fillers, retakes, captions - colour measured, never pushed", key: "edit-beauty", primary: true, slow: true },
  { id: "edit", args: ["--beauty", "--no-transcript"], argKind: "file", argLabel: "Path to your footage", stage: "make", cat: "beauty", label: "AI Cut (no captions)", desc: "for Bengali or any language the local model handles badly - skips whisper, much faster", key: "edit-beauty-nocap", slow: true },
  { id: "edit", args: ["--beauty", "--transition=dissolve"], argKind: "file", argLabel: "Path to your footage", stage: "make", cat: "beauty", label: "AI Cut, soft dissolves", desc: "gentler transitions between cuts", key: "edit-beauty-dissolve", slow: true },
  { id: "edit", args: ["--no-transitions"], argKind: "file", argLabel: "Path to your footage", stage: "make", cat: "all", label: "AI Cut, hard cuts only", desc: "no transitions - punchier, and the old behaviour", key: "edit-hardcut", slow: true },
  { id: "edit", args: ["--screencast"], argKind: "file", argLabel: "Path to your screen recording", stage: "make", cat: "coding", label: "AI Cut a screencast", desc: "everything above PLUS dead-screen removal — build waits and reading time, cut only where the screen is frozen AND you are silent", key: "edit-screencast", primary: true, slow: true },
  { id: "edit", args: ["--screencast"], argKind: "file", argLabel: "Path to your screen recording", stage: "make", cat: "ai-automation", label: "AI Cut a tool demo", desc: "dead-screen removal for demos — cuts the waiting, keeps you talking over a still screen", key: "edit-screencast-ai", primary: true, slow: true },
  { id: "reframe", args: [], argKind: "file", argLabel: "Path to 16:9 footage", stage: "make", cat: "beauty", label: "Reframe to 9:16", desc: "follows the motion instead of centre-cropping", slow: true },
  { id: "longform", args: [], argKind: "file", argLabel: "Path to your long recording", stage: "make", cat: "all", label: "Mine Shorts", desc: "your own footage only", slow: true },
  { id: "batch", args: ["3"], stage: "make", cat: "all", label: "Batch produce 3", desc: "sequential, cost-capped", danger: "spend", slow: true },
  { id: "steps", args: [], argKind: "renderId", stage: "make", cat: "coding", label: "Burn step callouts", desc: "STEP 1/5 overlays", slow: true },
  { id: "shorts", args: [], argKind: "renderId", stage: "make", cat: "all", label: "Cut clips", desc: "1-3 standalone clips from a finished video", slow: true },
  { id: "motion", args: ["list"], stage: "make", cat: "all", label: "Effect catalog", desc: "22 effects with measured scores", key: "motion-list" },

  /* ---------------- package ---------------- */
  { id: "thumbnails", args: [], argKind: "renderId", stage: "package", cat: "all", label: "Thumbnails", desc: "2 variants, judged", slow: true },
  { id: "tools", args: ["captions"], argKind: "renderId", stage: "package", cat: "all", label: "Captions", desc: ".srt/.vtt + reading speed + advertiser risk", key: "tools-captions" },
  { id: "tools", args: ["chapters"], argKind: "renderId", stage: "package", cat: "all", label: "Chapters", desc: "markers for the description", key: "tools-chapters" },
  { id: "tools", args: ["silent"], argKind: "renderId", stage: "package", cat: "all", label: "Silent copy", desc: "for muted autoplay feeds", key: "tools-silent", slow: true },
  { id: "tools", args: ["teleprompter"], argKind: "briefId", stage: "package", cat: "beauty", label: "Teleprompter", desc: "speed-matched script for the shoot", key: "tools-prompter" },
  { id: "humanize", args: ["script"], argKind: "briefId", stage: "package", cat: "all", label: "Check for AI tells", desc: "per-scene score with the specific tells named", key: "humanize-script" },
  { id: "humanize", args: ["audit"], stage: "package", cat: "all", label: "Audit all copy", desc: "how machine-written everything reads", key: "humanize-audit" },
  { id: "qc", args: [], argKind: "briefId", stage: "package", cat: "all", label: "Run the judges", desc: "all five quality gates" },

  /* ---------------- ship ---------------- */
  { id: "compliance", args: [], argKind: "renderId", stage: "ship", cat: "all", label: "Compliance check", desc: "exactly what is blocking publication", primary: true },
  { id: "publish", args: [], argKind: "renderId", stage: "ship", cat: "all", label: "Publish dry run", desc: "uploads nothing — shows what would happen", primary: true },
  { id: "center", args: [], stage: "ship", cat: "all", label: "Publish queue", desc: "what is staged and ready" },
  { id: "sync", args: ["status"], stage: "ship", cat: "all", label: "Cloud sync status", desc: "is the cloud able to run your jobs", key: "sync-status" },
  { id: "sync", args: ["push"], stage: "ship", cat: "all", label: "Send state to cloud", desc: "lets GitHub Actions render and edit your briefs", key: "sync-push" },
  { id: "sync", args: ["pull"], stage: "ship", cat: "all", label: "Get cloud results", desc: "bring back what the cloud did while this PC slept", key: "sync-pull" },
  { id: "sync", args: ["footage", "push"], argKind: "text", argLabel: "Footage file name", stage: "ship", cat: "beauty", label: "Send footage to cloud", desc: "so a cloud edit can use it - no laptop needed after this", key: "sync-footage-push", slow: true },
  { id: "r2", args: ["status"], stage: "ship", cat: "all", label: "Off-machine storage", desc: "what is backed up to R2 and what is not", key: "r2-status" },
  { id: "inbox", args: ["list"], stage: "make", cat: "all", label: "Footage drop folder", desc: "where to copy big files instead of uploading them", key: "inbox-list", primary: true },
  { id: "inbox", args: ["edit"], argKind: "text", argLabel: "File name from the drop folder", stage: "make", cat: "beauty", label: "AI Cut a dropped file", desc: "no upload — just the file name", key: "inbox-edit", slow: true },
  { id: "queue", args: ["status"], stage: "ship", cat: "all", label: "Request queue", desc: "what others have asked for while this PC was asleep", key: "queue-status", primary: true },
  { id: "queue", args: ["drain"], stage: "ship", cat: "all", label: "Run queued requests", desc: "work through the backlog oldest first", key: "queue-drain", slow: true },
  { id: "queue", args: ["retry"], stage: "ship", cat: "all", label: "Retry failed requests", desc: "requeue everything that errored", key: "queue-retry" },
  { id: "viewer", args: ["build"], stage: "ship", cat: "all", label: "Rebuild public page", desc: "refresh the always-on video list", key: "viewer-build" },
  { id: "r2", args: ["push"], argKind: "renderId", stage: "ship", cat: "all", label: "Push a render off this PC", desc: "makes it downloadable anywhere, even with this laptop asleep", key: "r2-push", slow: true },
  { id: "r2", args: ["push", "--all"], stage: "ship", cat: "all", label: "Push every render", desc: "backfill everything not yet uploaded", key: "r2-push-all", slow: true },
  { id: "r2", args: ["url"], argKind: "renderId", stage: "ship", cat: "all", label: "Get download links", desc: "shareable links, valid up to 7 days", key: "r2-url" },
  { id: "r2", args: ["prune"], stage: "ship", cat: "all", label: "Free expired storage", desc: "delete anything past 48h — permanent", key: "r2-prune" },
  { id: "r2", args: ["prune", "--dry-run"], stage: "ship", cat: "all", label: "Preview what expires", desc: "shows what prune would delete, deletes nothing", key: "r2-prune-dry" },
  { id: "r2", args: ["rm"], argKind: "renderId", stage: "ship", cat: "all", label: "Delete one from storage", desc: "permanent in R2; the local copy stays", key: "r2-rm", danger: "deletes remote files" },

  /* ---------------- learn ---------------- */
  { id: "analytics", args: [], stage: "learn", cat: "all", label: "Pull stats", desc: "real numbers from your channel", slow: true },
  { id: "calibrate", args: ["scorecard"], stage: "learn", cat: "all", label: "Scorecard", desc: "what you predicted vs what happened", key: "cal-scorecard" },
  { id: "calibrate", args: ["memo"], stage: "learn", cat: "all", label: "Weekly memo", desc: "what changed and why", key: "cal-memo" },
  { id: "lessons", args: [], stage: "learn", cat: "all", label: "Lessons", desc: "rules learned, injected back into generation" },
  { id: "playbook", args: [], stage: "learn", cat: "all", label: "Playbooks", desc: "per-platform rules from your own results" },
  { id: "prompts", args: [], stage: "learn", cat: "all", label: "Prompt versions", desc: "you approve every change" },
  { id: "digest", args: [], stage: "learn", cat: "all", label: "Today's digest", desc: "what moved overnight" },

  /* ---------------- ops ---------------- */
  { id: "ai", args: [], stage: "ops", cat: "all", label: "AI tiers", desc: "which tier is live and your real balance", primary: true },
  { id: "ai", args: ["models"], stage: "ops", cat: "all", label: "Free model list", desc: "the roster rotates — check when calls start failing", key: "ai-models" },
  { id: "capabilities", args: ["report"], stage: "ops", cat: "all", label: "What this machine can run", desc: "live vs needs-hardware vs deliberate non-goal", key: "cap-report" },
  { id: "capabilities", args: ["licenses"], stage: "ops", cat: "all", label: "Model licences", desc: "which models are safe to monetise", key: "cap-licenses" },
  { id: "health", args: [], stage: "ops", cat: "all", label: "Output health", desc: "is what it produces any good (not: is the toolchain OK)", primary: true },
  { id: "doctor", args: [], stage: "ops", cat: "all", label: "Toolchain check", desc: "every tool and key the pipeline needs" },
  { id: "prune", args: [], stage: "ops", cat: "all", label: "Data hygiene", desc: "dry run — shows what it would remove" },
  { id: "dryrun", args: [], stage: "ops", cat: "all", label: "Prove the pipeline", desc: "end-to-end test run", danger: "slow", slow: true },
];

/** Stable key for a row (several rows share a command id). */
export const keyOf = (c) => c.key || (c.args.length ? `${c.id}-${c.args[0]}` : c.id);

/** Build argv for a row, given the user's input. */
export function argvFor(cmd, input = "") {
  const extra = String(input || "").trim();
  if (!cmd.argKind || cmd.argKind === "none") return [cmd.id, ...cmd.args];
  if (!extra) throw new Error(`${cmd.label} needs ${cmd.argLabel || cmd.argKind}`);
  // `capture tool Cursor https://…` arrives as one field; split it
  const parts = cmd.argKind === "text" && cmd.args[0] === "tool" ? extra.split(/\s+/) : [extra];
  return [cmd.id, ...cmd.args, ...parts];
}

/** Every command id the registry can run — the runner's allowlist. */
export const RUNNABLE_IDS = [...new Set(COMMANDS.map((c) => c.id))];

/**
 * Deliberately terminal-only, with the reason. Listed so "why is this not a
 * button" has an answer in the UI rather than looking like an oversight.
 */
export const TERMINAL_ONLY = [
  { id: "worker", why: "a long-running daemon — it never exits, so a button would hang the job runner. Leave it in its own terminal." },
  { id: "auth-youtube", why: "opens a browser for Google's OAuth consent and waits for a paste-back. That has to be interactive." },
  { id: "publish --go", why: "the one real upload. Kept as a deliberate terminal action so it can never be a mis-click." },
  { id: "help", why: "the portal IS the help." },
];

/**
 * Assert the registry matches the CLI. A button that appears and then fails is
 * worse than a missing button, so this runs in the portal's own test path.
 */
export function verifyRegistry(cliCommandIds) {
  const missing = RUNNABLE_IDS.filter((id) => !cliCommandIds.includes(id));
  const dupes = [];
  const seen = new Set();
  for (const c of COMMANDS) {
    const k = keyOf(c);
    if (seen.has(k)) dupes.push(k);
    seen.add(k);
  }
  return { ok: !missing.length && !dupes.length, missing, dupes, total: COMMANDS.length };
}
