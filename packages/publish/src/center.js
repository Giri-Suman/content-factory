import { existsSync } from "node:fs";
import { loadEnv } from "../../shared/src/config.js";
import { collection, newId } from "../../shared/src/store.js";

/**
 * P10 Publish Center: approved Brief -> PublishItems per platform ->
 * staged publish -> MyPost rows for the P15 calibration loop.
 *
 * Modes (spec P0.1): staged is the permanent default. auto requires
 * PUBLISH_MODE=auto AND YOUTUBE_APP_VERIFIED=true (checked at RUNTIME,
 * here) — until Google verification clears, uploads land private/unlisted
 * and the human flips them live in Studio.
 */

const PLATFORMS = ["youtube", "instagram", "linkedin", "x"];

/** Parse a scheduledFor sort key out of the brief's timing_ist strings. */
function scheduleFor(platform, brief) {
  const t = brief.payload?.timing_ist || {};
  const text = { youtube: t.yt, instagram: t.ig, linkedin: t.linkedin, x: t.x }[platform] || "unscheduled";
  const dateMatch = String(text).match(/\d{4}-\d{2}-\d{2}/);
  const date = dateMatch ? dateMatch[0] : new Date().toISOString().slice(0, 10);
  const timeMatch = String(text).match(/(\d{2}):(\d{2})/);
  return { text, sortKey: `${date}T${timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : "23:59"}` };
}

function assetsFor(platform, brief) {
  const p = brief.payload || {};
  if (platform === "youtube") {
    return {
      title: p.yt_short?.title || brief.topic,
      description: p.yt_short?.description || "",
      tags: p.yt_short?.tags || [],
      chosenHook: p.yt_short?.hook_variants?.[0] || null,
      lengthSec: p.yt_short?.length_sec || null,
      videoFile: null,
      thumbFile: null,
    };
  }
  if (platform === "instagram") {
    return {
      caption: p.ig_reel?.caption || "",
      hashtags: p.ig_reel?.hashtags || [],
      manualChecklist: (p.manual_publish_checklist || []).filter((s) => /reel|IG|instagram/i.test(s)),
      videoFile: null,
    };
  }
  if (platform === "linkedin") return { post_text: p.linkedin?.post_text || "" };
  return { thread: p.x_thread || [] };
}

export function sendToCenter(briefId) {
  const brief = collection("briefs").get(briefId);
  if (!brief) throw new Error(`no brief ${briefId}`);
  if (brief.status !== "approved") throw new Error(`brief is ${brief.status} — approve it first`);

  const items = collection("publishitems");
  const existing = items.find((i) => i.briefId === briefId).map((i) => i.platform);
  const created = [];
  for (const platform of PLATFORMS) {
    if (existing.includes(platform)) continue;
    const sched = scheduleFor(platform, brief);
    created.push(
      items.upsert({
        id: newId(),
        briefId,
        topic: brief.topic,
        platform,
        mode: "staged",
        assets: assetsFor(platform, brief),
        scheduledFor: sched.sortKey,
        scheduledText: sched.text,
        status: "preparing",
        golden60Done: false,
        publishedAt: null,
        externalUrl: null,
        createdAt: new Date().toISOString(),
      })
    );
  }
  return { created: created.length, skipped: existing.length };
}

export function attachFile(itemId, filePath, kind = "video") {
  if (!existsSync(filePath)) throw new Error(`file not found: ${filePath}`);
  const items = collection("publishitems");
  const item = items.get(itemId);
  if (!item) throw new Error(`no publish item ${itemId}`);
  const key = kind === "thumb" ? "thumbFile" : "videoFile";
  return items.update(itemId, { assets: { ...item.assets, [key]: filePath } });
}

/** The one-tap Publish. YouTube = staged API upload; others = manual-step completion. */
export async function publishItem(itemId) {
  loadEnv();
  const items = collection("publishitems");
  const item = items.get(itemId);
  if (!item) throw new Error(`no publish item ${itemId}`);
  if (item.status === "published") return { item, note: "already published" };

  if (item.platform === "youtube") {
    if (!item.assets.videoFile) throw new Error("attach a video file first");
    if (!process.env.YT_REFRESH_TOKEN) {
      throw new Error("YouTube upload needs OAuth — run: factory auth-youtube (YT_CLIENT_ID/SECRET/REFRESH_TOKEN in .env)");
    }
    const { uploadVideo, setThumbnail } = await import("./youtube.js");
    const autoMode = process.env.PUBLISH_MODE === "auto" && process.env.YOUTUBE_APP_VERIFIED === "true";
    const privacyStatus = autoMode ? "public" : "unlisted"; // staged = draft the human flips
    const meta = {
      title: item.assets.title,
      description: item.assets.description,
      tags: item.assets.tags,
      privacyStatus,
      synthetic: true,
    };
    try {
      const { videoId, url } = await uploadVideo(item.assets.videoFile, meta, {});
      if (item.assets.thumbFile) await setThumbnail(videoId, item.assets.thumbFile).catch((e) => console.error(`thumbnail failed: ${e.message}`));
      const updated = items.update(itemId, {
        status: autoMode ? "published" : "ready",
        externalUrl: url,
        studioUrl: `https://studio.youtube.com/video/${videoId}/edit`,
        publishedAt: autoMode ? new Date().toISOString() : null,
      });
      if (autoMode) recordMyPost(updated, videoId);
      return { item: updated, note: autoMode ? "published PUBLIC (auto mode)" : `uploaded as ${privacyStatus} draft — flip live in Studio, then Mark live` };
    } catch (e) {
      items.update(itemId, { status: "failed", lastError: String(e.message).slice(0, 300) });
      throw e;
    }
  }

  if (item.platform === "instagram" || item.platform === "facebook") {
    if (process.env.META_APP_REVIEWED === "true") {
      const { publishReel } = await import("./meta.js");
      const url = await publishReel(item);
      const updated = items.update(itemId, { status: "published", publishedAt: new Date().toISOString(), externalUrl: url });
      recordMyPost(updated, url);
      return { item: updated, note: "published via Graph API" };
    }
    // manual mode: Publish = "I posted it in the app"
    return { item: markPublished(itemId), note: "marked as manually posted (Meta app not reviewed — Graph flow idle)" };
  }

  // x / linkedin: copy-paste platforms — Publish = manual completion
  return { item: markPublished(itemId), note: "marked as manually posted" };
}

/** Manual completion (or the Studio flip for staged YouTube drafts). */
export function markPublished(itemId, externalUrl = null) {
  const items = collection("publishitems");
  const item = items.get(itemId);
  if (!item) throw new Error(`no publish item ${itemId}`);
  const updated = items.update(itemId, {
    status: "published",
    publishedAt: new Date().toISOString(),
    externalUrl: externalUrl || item.externalUrl,
  });
  recordMyPost(updated, externalUrl || item.externalUrl || null);
  return updated;
}

/** MyPost row — the raw material of the P15 calibration loop. */
function recordMyPost(item, externalRef) {
  const brief = collection("briefs").get(item.briefId) || {};
  const idMatch = String(externalRef || "").match(/(?:v=|shorts\/|youtu\.be\/|video\/)([\w-]{11})/);
  collection("myposts").upsert(
    {
      id: newId(),
      publishItemId: item.id,
      platform: item.platform,
      externalId: idMatch ? idMatch[1] : externalRef || null,
      postedAt: item.publishedAt || new Date().toISOString(),
      hookText: item.assets?.chosenHook || brief.payload?.yt_short?.hook_variants?.[0] || null,
      hookPattern: null, // P11's classifier fills this
      pillar: brief.pillar || null, // P14 backfills
      lengthSec: item.assets?.lengthSec || brief.payload?.yt_short?.length_sec || null,
      title: item.assets?.title || brief.topic,
      kind: brief.kind || null,
      statsSnapshots: [],
    },
    (r) => r.publishItemId
  );
}

export function setGolden60(itemId, done) {
  return collection("publishitems").update(itemId, { golden60Done: Boolean(done) });
}

export function centerQueue() {
  return collection("publishitems")
    .all()
    .sort((a, b) => (a.scheduledFor || "z").localeCompare(b.scheduledFor || "z"));
}
