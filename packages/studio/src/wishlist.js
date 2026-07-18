import { loadEnv, NICHE_CONTEXT } from "../../shared/src/config.js";
import { collection, newId, validateShape } from "../../shared/src/store.js";
import { chat, providerStatus } from "../../llm/src/llm.js";
import { hasKey, parseVideoId, videoContext, videoStats } from "../../radar/src/youtube.js";

/**
 * P5 Wishlist Analyzer. Flow A: YouTube URL -> API autopsy + 48h tracking.
 * Flow B: IG/FB manual-metrics entry (NO scraping — permanent non-goal).
 * Both end in a verdict card with a predictedTier that P15 calibration
 * will later score against reality.
 */

export const HOOK_PATTERNS = [
  "Identity Call", "Contrarian Strike", "Open Loop", "Confession", "Results First",
  "Mistake Warning", "List Tease", "Direct Question", "POV/Relatable",
];

const TRACK_HOURS = 48;

/**
 * predictedTier rubric — transparent and coded, per spec:
 *   API mode (channel context known):
 *     S: outlierRatio >= 3  AND engagementRate >= channel norm
 *     A: outlierRatio >= 1.5 AND engagementRate >= half the channel norm
 *     B: outlierRatio >= 0.7 (performing at channel par)
 *     C: below par
 *   Manual mode (no channel median — follower count is the base):
 *     S: viewsPerFollower >= 5   AND engagementRate >= 0.05  (escaped the audience)
 *     A: viewsPerFollower >= 1.5 AND engagementRate >= 0.03
 *     B: viewsPerFollower >= 0.5
 *     C: below
 */
export function predictTier(m) {
  if (m.mode === "api") {
    const norm = m.channelEngagementNorm || 0.04;
    if (m.outlierRatio >= 3 && m.engagementRate >= norm) return "S";
    if (m.outlierRatio >= 1.5 && m.engagementRate >= norm / 2) return "A";
    if (m.outlierRatio >= 0.7) return "B";
    return "C";
  }
  if (m.viewsPerFollower >= 5 && m.engagementRate >= 0.05) return "S";
  if (m.viewsPerFollower >= 1.5 && m.engagementRate >= 0.03) return "A";
  if (m.viewsPerFollower >= 0.5) return "B";
  return "C";
}

/** ONE LLM call: structural analysis. Strict JSON, one retry, null on failure. */
async function structuralAnalysis({ title, caption, firstSeconds, platform }) {
  if (!providerStatus().active) return null;
  const ask = async () => {
    const res = await chat({
      task: "score",
      maxTokens: 1200,
      system:
        `You dissect viral ${platform} videos for this creator: ${NICHE_CONTEXT}. ` +
        `Classify the hook against EXACTLY one of: ${HOOK_PATTERNS.join(", ")}. Reply ONLY JSON: ` +
        '{"hookPattern":"<one of the 9>","topic":"<inferred topic>","titleSpecificity":<0-10>,' +
        '"whyItWorked":["<bullet>","<bullet>","<bullet>"],"stealThis":"<concrete adaptation for MY niche>"}',
      user: [
        `Title/caption: ${title || caption || "(none)"}`,
        caption && title ? `Caption: ${caption}` : null,
        firstSeconds ? `First 3 seconds (viewer-described): ${firstSeconds}` : null,
      ].filter(Boolean).join("\n"),
    });
    const parsed = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
    const check = validateShape(parsed, {
      hookPattern: "string", topic: "string", titleSpecificity: "number", whyItWorked: "array", stealThis: "string",
    });
    if (!check.ok) throw new Error(check.errors.join(", "));
    return parsed;
  };
  try {
    return await ask();
  } catch {
    try {
      return await ask(); // one retry per the LLM contract
    } catch {
      return null; // graceful degradation — a failed LLM call never crashes the pipeline
    }
  }
}

/* ---------------- Flow A: YouTube ---------------- */

export async function analyzeYouTube(url) {
  loadEnv();
  if (!hasKey()) throw new Error("YouTube analysis needs YOUTUBE_API_KEY in .env (IG/FB manual mode still works)");
  const videoId = parseVideoId(url);
  if (!videoId) throw new Error(`can't find a video id in: ${url}`);

  const ctx = await videoContext(videoId);
  const v = ctx.video;
  const hoursLive = Math.max(1, (Date.now() - new Date(v.publishedAt).getTime()) / 36e5);
  const metrics = {
    mode: "api",
    views: v.views, likes: v.likes, comments: v.comments, durationSec: v.durationSec,
    publishedAt: v.publishedAt, hoursLive: Math.round(hoursLive),
    channelTitle: ctx.channel.title, channelSubs: ctx.channel.subscriberCount,
    channelMedianViews: ctx.channelMedianViews, channelEngagementNorm: ctx.channelEngagementNorm,
    outlierRatio: ctx.channelMedianViews > 0 ? Math.round((v.views / ctx.channelMedianViews) * 10) / 10 : null,
    engagementRate: v.views > 0 ? Math.round(((v.likes + v.comments) / v.views) * 1000) / 1000 : 0,
    viewsPerHour: Math.round(v.views / hoursLive),
    snapshots: [{ at: new Date().toISOString(), views: v.views, likes: v.likes, comments: v.comments }],
  };

  const contentAnalysis = await structuralAnalysis({ title: v.title, platform: "YouTube" });
  const predictedTier = predictTier(metrics);

  return collection("wishlist").upsert({
    id: newId(),
    platform: "youtube",
    url: `https://youtube.com/watch?v=${videoId}`,
    videoId,
    title: v.title,
    mode: "api",
    metrics,
    contentAnalysis,
    verdict: { predictedTier, rubric: rubricLine(metrics, predictedTier) },
    predictedTier,
    tracking: { until: new Date(Date.now() + TRACK_HOURS * 36e5).toISOString(), lastPolledAt: null },
    createdAt: new Date().toISOString(),
  });
}

/* ---------------- Flow B: IG/FB manual ---------------- */

export async function analyzeManual(form) {
  loadEnv();
  const views = Number(form.views) || 0;
  const followers = Number(form.creatorFollowerCount) || 0;
  const hours = Math.max(1, Number(form.hoursSincePost) || 1);
  const metrics = {
    mode: "manual",
    views, likes: Number(form.likes) || 0, comments: Number(form.comments) || 0,
    shares: form.shares ? Number(form.shares) : null,
    hoursSincePost: hours, creatorFollowerCount: followers,
    viewsPerFollower: followers > 0 ? Math.round((views / followers) * 100) / 100 : 0,
    engagementRate: views > 0 ? Math.round((((Number(form.likes) || 0) + (Number(form.comments) || 0)) / views) * 1000) / 1000 : 0,
    viewsPerHour: Math.round(views / hours),
  };
  const contentAnalysis = await structuralAnalysis({
    caption: form.caption, firstSeconds: form.firstSeconds, platform: form.platform === "facebook" ? "Facebook" : "Instagram",
  });
  const predictedTier = predictTier(metrics);

  return collection("wishlist").upsert({
    id: newId(),
    platform: form.platform === "facebook" ? "facebook" : "instagram",
    url: form.url || null,
    title: (form.caption || "").slice(0, 120) || "(manual entry)",
    mode: "manual",
    metrics,
    contentAnalysis,
    verdict: { predictedTier, rubric: rubricLine(metrics, predictedTier) },
    predictedTier,
    createdAt: new Date().toISOString(),
  });
}

function rubricLine(m, tier) {
  return m.mode === "api"
    ? `${tier}: outlier ${m.outlierRatio ?? "?"}x vs channel median ${m.channelMedianViews}, engagement ${(m.engagementRate * 100).toFixed(1)}% vs norm ${((m.channelEngagementNorm || 0.04) * 100).toFixed(1)}%`
    : `${tier}: ${m.viewsPerFollower}x views/follower, engagement ${(m.engagementRate * 100).toFixed(1)}%, ${m.viewsPerHour}/h`;
}

/* ---------------- tracking (worker calls this hourly; P8) ---------------- */

export async function pollTracked() {
  loadEnv();
  const wishlist = collection("wishlist");
  const now = Date.now();
  const due = wishlist.find(
    (e) =>
      e.mode === "api" &&
      e.tracking?.until &&
      new Date(e.tracking.until).getTime() > now &&
      (!e.tracking.lastPolledAt || now - new Date(e.tracking.lastPolledAt).getTime() > 55 * 60 * 1000)
  );
  if (!due.length) return { polled: 0 };
  if (!hasKey()) return { polled: 0, note: "no YOUTUBE_API_KEY" };

  let polled = 0;
  for (const e of due) {
    try {
      const s = await videoStats(e.videoId);
      if (!s) continue;
      const snapshots = [...(e.metrics.snapshots || []), { at: new Date().toISOString(), ...s }].slice(-60);
      const first = snapshots[0];
      const hours = Math.max(1, (now - new Date(first.at).getTime()) / 36e5);
      wishlist.update(e.id, {
        metrics: {
          ...e.metrics, ...s, snapshots,
          trackedViewsPerHour: Math.round((s.views - first.views) / hours),
        },
        tracking: { ...e.tracking, lastPolledAt: new Date().toISOString() },
      });
      polled++;
    } catch {
      /* one entry failing never stops the poll */
    }
  }
  return { polled };
}
