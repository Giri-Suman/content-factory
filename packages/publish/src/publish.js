import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnv, repoRoot } from "../../shared/src/config.js";
import { checkCompliance, buildMetadata } from "./compliance.js";
import { appendLog } from "./log.js";

const rendersDir = path.join(repoRoot, "renders");

const ICON = { ok: "+", warn: "o", fail: "x" };

/**
 * publish <id> [--wide|--short] [--public|--unlisted] [--at "<iso>"] [--go]
 *
 * Safe by default: runs compliance, then a DRY RUN that shows exactly what
 * would upload. Nothing is sent to YouTube until you add --go, and even then
 * privacy is PRIVATE unless you explicitly pass --public / --unlisted.
 */
export async function publish(argv) {
  loadEnv();
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const id = argv.filter((a) => !a.startsWith("--"))[0];
  if (!id) {
    console.error('usage: factory publish <id> [--short|--wide] [--public|--unlisted] [--at "2026-07-13T15:00"] [--go]');
    return false;
  }

  const atIdx = argv.indexOf("--at");
  const publishAt = atIdx !== -1 ? argv[atIdx + 1] : null;

  const which = flags.has("--wide") ? "wide.mp4" : "short.mp4";
  const file = path.join(rendersDir, id, which);
  if (!existsSync(file)) {
    const alt = path.join(rendersDir, id, which === "short.mp4" ? "wide.mp4" : "short.mp4");
    if (!existsSync(alt)) {
      console.error(`no video for ${id} in renders/ — render it first`);
      return false;
    }
  }

  // 1 — compliance gate
  console.log(`\ncompliance check for ${id}:`);
  const { pass, checks } = checkCompliance(id, { platform: "youtube" });
  for (const c of checks) console.log(`  ${ICON[c.level]} ${c.msg}`);
  if (!pass) {
    console.error(`\nBLOCKED — fix the (x) items above before publishing.\n`);
    return false;
  }

  // 2 — metadata (private unless explicitly overridden)
  const privacyStatus = flags.has("--public") ? "public" : flags.has("--unlisted") ? "unlisted" : "private";
  const meta = buildMetadata(id, { privacyStatus });

  console.log(`\nwould upload to YouTube:`);
  console.log(`  file:     ${path.basename(file)}`);
  console.log(`  title:    ${meta.title}`);
  console.log(`  privacy:  ${privacyStatus}${publishAt ? ` (scheduled ${publishAt})` : ""}`);
  console.log(`  disclose: ${meta.synthetic ? "altered/synthetic content = YES" : "none"}`);
  console.log(`  tags:     ${meta.tags.slice(0, 8).join(", ")}`);

  // 3 — dry run unless --go
  if (!flags.has("--go")) {
    console.log(`\nDRY RUN — nothing uploaded. Add --go to publish for real.`);
    if (privacyStatus !== "private") console.log(`(and it would go ${privacyStatus.toUpperCase()} — double-check.)`);
    appendLog({ id, platform: "youtube", dryRun: true, privacyStatus });
    console.log("");
    return true;
  }

  if (!process.env.YT_REFRESH_TOKEN) {
    console.error(`\ncan't publish for real — no YouTube credentials. Run: factory auth-youtube\n`);
    return false;
  }

  // 4 — real upload
  console.log(`\nuploading (${privacyStatus})...`);
  const { uploadVideo } = await import("./youtube.js");
  try {
    const { videoId, url } = await uploadVideo(file, meta, { publishAt });
    appendLog({ id, platform: "youtube", videoId, privacyStatus, publishAt: publishAt || null, category: meta.category });
    console.log(`\n✓ uploaded: ${url}  (${privacyStatus})`);
    console.log(`  disclosure set. Verify in YouTube Studio before making it public.\n`);
    return true;
  } catch (err) {
    console.error(`\nupload failed: ${err.message}\n`);
    return false;
  }
}
