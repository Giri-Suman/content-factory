import { loadEnv, NICHE_CONTEXT } from "../../shared/src/config.js";
import { collection, newId, validateShape } from "../../shared/src/store.js";
import { chat, providerStatus } from "../../llm/src/llm.js";

/**
 * P6 Brief Studio: TopicCluster or WishlistEntry -> one multi-platform
 * brief. Creative fields come from ONE LLM call (strict JSON, validated,
 * one retry); timing + the manual publish checklist are DETERMINISTIC
 * rules so a keyless brief is still a usable, fillable skeleton.
 */

/* ---------------- timing rules (encoded defaults) ---------------- */

const TIMING_RATIONALE =
  "Public-research defaults (India+global audience): YT Shorts evening IST commute/wind-down, " +
  "IG lunch or night scroll, LinkedIn weekday mornings, X early. Your own analytics override these after 3-4 weeks of posts.";

function timingFor(kind) {
  if (kind === "trend") {
    return {
      yt: "today 19:00-21:00 IST",
      ig: "today 12:30 or 20:30 IST",
      linkedin: "next weekday 10:00 IST",
      x: "today 09:30 IST (or +1h from now if later)",
      rationale: `Trend: all platforms same day. ${TIMING_RATIONALE}`,
    };
  }
  // evergreen: one short/day queue — next date with no evergreen brief scheduled
  const briefs = collection("briefs").all();
  const taken = new Set(briefs.filter((b) => b.kind === "evergreen" && b.status !== "killed").map((b) => b.scheduledDate));
  const d = new Date();
  for (let i = 0; i < 60; i++) {
    d.setDate(d.getDate() + 1);
    const day = d.toISOString().slice(0, 10);
    if (!taken.has(day)) {
      return {
        scheduledDate: day,
        yt: `${day} 19:00-21:00 IST`,
        ig: `${day} 12:30 or 20:30 IST`,
        linkedin: "next weekday 10:00 IST after the Short",
        x: `${day} 09:30 IST`,
        rationale: `Evergreen: next free daily slot (one short/day). ${TIMING_RATIONALE}`,
      };
    }
  }
  return { yt: "queue full 60 days out", rationale: TIMING_RATIONALE };
}

function checklistFor(kind, timing) {
  return [
    `Render/record the Short. Upload natively on YouTube ${timing.yt} — paste title, description, tags from the YT tab.`,
    `Post the IG Reel in-app ${timing.ig} — caption + hashtags from the IG tab. Consider the Trial Reel toggle; native trending audio at low volume under the voiceover if it fits.`,
    "Golden 60: reply to every comment on both platforms in the first 60 minutes.",
    `LinkedIn ${timing.linkedin} — paste the post text native, no external links.`,
    `X thread ${timing.x} — three posts from the X tab.`,
    "Thumbnails: variant A auto-set on upload. Add variant B in YouTube Studio → Test & Compare (native A/B is Studio-only).",
    "Export the IG carousel slides when you have 10 minutes; post as a follow-up save-magnet.",
    kind === "trend" ? "All of the above lands TODAY — the deadline chip is real." : "Evergreen: keep the daily-slot queue order.",
  ];
}

/* ---------------- LLM payload ---------------- */

const PAYLOAD_SHAPE = {
  kind: "string", core_idea: "string", yt_short: "object", ig_reel: "object",
  ig_carousel: "object", linkedin: "object", x_thread: "array",
  blog_outline: "object", platform_adjustments: "array",
};

async function llmPayload(context, kind, lengthTarget = 32) {
  if (!providerStatus().active) return null;
  const { lessonsFor } = await import("./lessons.js");
  const lessonBlock = lessonsFor("metadata").block + lessonsFor("script").block;
  const ask = async () => {
    const res = await chat({
      task: "script",
      maxTokens: 6000,
      system:
        `You write multi-platform content briefs for this creator: ${NICHE_CONTEXT}.${lessonBlock} ` +
        `Target the YouTube Short at ~${lengthTarget}s (the platform playbook's proven length). ` +
        "Every hook must be concrete and specific — generic openers ('you won't believe') are banned. Reply ONLY JSON:\n" +
        `{"kind":"trend|evergreen","core_idea":"...","yt_short":{"hook_variants":["3 different hooks"],"beats":["scene beats"],` +
        `"length_sec":${lengthTarget},"title":"...","description":"keyword-rich, 2 lines","tags":["..."]},` +
        '"ig_reel":{"script_adjustments":"...","caption":"conversational, ends with a question","hashtags":["<=8 niche tags"]},' +
        '"ig_carousel":{"slides":["7 short strings"],"cover_text":"..."},' +
        '"linkedin":{"post_text":"all value native, NO external links, inline code snippet if relevant"},' +
        '"x_thread":["3 strings"],' +
        '"blog_outline":{"title":"...","quick_answer":"2 sentences","h2_sections":["..."],"original_data_angle":"..."},' +
        '"platform_adjustments":["concrete per-platform diffs"]}',
      user: `${context}\n\nkind should be: ${kind}`,
    });
    const parsed = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
    const check = validateShape(parsed, PAYLOAD_SHAPE);
    if (!check.ok) throw new Error(check.errors.join(", "));
    if (!Array.isArray(parsed.yt_short?.hook_variants) || parsed.yt_short.hook_variants.length < 3)
      throw new Error("yt_short.hook_variants needs 3 entries");
    return parsed;
  };
  try {
    return await ask();
  } catch {
    try {
      return await ask();
    } catch {
      return null;
    }
  }
}

/** Keyless skeleton — deterministic structure, hand-fillable content. */
function templatePayload(topic, kind, lengthTarget = 32) {
  const P = (hint) => `[fill: ${hint}]`;
  return {
    template: true,
    kind,
    core_idea: `${topic} — ${P("the one-sentence angle that makes this YOURS")}`,
    yt_short: {
      hook_variants: [P("Open Loop hook"), P("Contrarian Strike hook"), P("Results First hook")],
      beats: [P("beat 1: the hook visual"), P("beat 2: the meat"), P("beat 3: payoff + CTA")],
      length_sec: lengthTarget,
      title: topic.slice(0, 90),
      description: P("2 keyword-rich lines"),
      tags: ["ai automation", "coding"],
    },
    ig_reel: { script_adjustments: P("open on the payoff, not the setup"), caption: P("conversational caption ending with a question?"), hashtags: ["#aiautomation", "#coding", "#developer"] },
    ig_carousel: { slides: [1, 2, 3, 4, 5, 6, 7].map((n) => P(`slide ${n}`)), cover_text: topic.slice(0, 60) },
    linkedin: { post_text: P("native value post, no external links") },
    x_thread: [P("post 1 — the claim"), P("post 2 — the proof"), P("post 3 — the takeaway")],
    blog_outline: { title: topic, quick_answer: P("2-sentence answer"), h2_sections: [P("h2"), P("h2"), P("h2")], original_data_angle: P("what data only YOU have") },
    platform_adjustments: [P("YT: ..."), P("IG: ..."), P("LinkedIn: ...")],
  };
}

/* ---------------- generation ---------------- */

export async function generateBrief({ clusterId, wishlistId, topic: rawTopic, series }) {
  loadEnv();
  let topic, context, source, kind;
  if (rawTopic) {
    topic = rawTopic;
    source = { keyword: rawTopic };
    context = `KEYWORD/TOPIC: ${rawTopic}\n(an opportunity keyword — weak YouTube supply, real demand signals for my niche)`;
    kind = "evergreen";
  } else if (clusterId) {
    const c = collection("clusters").get(clusterId);
    if (!c) throw new Error(`no cluster ${clusterId}`);
    topic = c.label;
    source = { topicClusterId: c.id };
    const members = (c.memberIds || []).length;
    context =
      `TOPIC CLUSTER: ${c.label}\nsummary: ${c.summary || "(none)"}\nopportunity score: ${c.opportunityScore} (${c.status})\n` +
      `score breakdown: ${Object.entries(c.scoreBreakdown || {}).map(([k, v]) => `${k} ${v.value}/${v.max} (${v.detail})`).join("; ")}\nmembers: ${members}`;
    // trend when the momentum is real: rising status or a hot velocity component
    kind = c.status === "rising" && (c.scoreBreakdown?.velocity?.value ?? 0) >= 20 ? "trend" : "evergreen";
  } else if (wishlistId) {
    const w = collection("wishlist").get(wishlistId);
    if (!w) throw new Error(`no wishlist entry ${wishlistId}`);
    topic = w.contentAnalysis?.stealThis || w.title;
    source = { wishlistEntryId: w.id };
    context =
      `WISHLIST AUTOPSY of "${w.title}" (${w.platform}, tier ${w.predictedTier}):\n` +
      `metrics: ${JSON.stringify({ views: w.metrics.views, engagementRate: w.metrics.engagementRate, outlierRatio: w.metrics.outlierRatio ?? null })}\n` +
      (w.contentAnalysis
        ? `hook pattern: ${w.contentAnalysis.hookPattern}\nwhy it worked: ${(w.contentAnalysis.whyItWorked || []).join("; ")}\nSTEAL THIS (build the brief around it): ${w.contentAnalysis.stealThis}`
        : "no structural analysis (keyless) — adapt the title directly") ;
    kind = "evergreen";
  } else {
    throw new Error("generateBrief needs clusterId, wishlistId, or topic");
  }

  // P14: series briefs inherit numbering + continuity notes
  if (series) {
    context += `\n\nSERIES: "${series.name}" — this is episode ${series.episodeNum}. Continuity notes: ${series.continuityNotes || "(none)"}. Reference earlier episodes naturally; keep the running format.`;
    topic = `${series.name} #${series.episodeNum}: ${topic}`;
  }

  // P14 dedupe guard: warn (never block) on near-duplicate ideas
  let duplicateWarning = null;
  try {
    const { dedupeCheck } = await import("./ideaBank.js");
    const dupe = dedupeCheck(topic);
    if (dupe) duplicateWarning = dupe;
  } catch {
    /* guard must never block generation */
  }

  // P22: the yt_short playbook sets the target length (approved changes flow here)
  let lengthTarget = 32;
  try {
    const { playbookTarget } = await import("./playbooks.js");
    lengthTarget = playbookTarget("yt_short");
  } catch {
    /* default */
  }

  const payload = (await llmPayload(context, kind, lengthTarget)) || templatePayload(topic, kind, lengthTarget);
  if (payload.yt_short && !payload.template) payload.yt_short.length_sec = payload.yt_short.length_sec || lengthTarget;
  const finalKind = payload.kind === "trend" || payload.kind === "evergreen" ? payload.kind : kind;
  const timing = timingFor(finalKind);
  payload.timing_ist = timing;
  payload.manual_publish_checklist = checklistFor(finalKind, timing);

  // P11: every brief carries its title + hook scores (Lab re-rolls update them)
  try {
    const { scoreTitle, scoreHook } = await import("./titleLab.js");
    payload._scores = {
      title: await scoreTitle(payload.yt_short.title),
      hooks: await Promise.all(payload.yt_short.hook_variants.map((h) => scoreHook(h))),
    };
  } catch {
    payload._scores = null; // scoring must never block brief generation
  }

  return collection("briefs").upsert({
    id: newId(),
    ...source,
    seriesId: series?.id || null,
    episodeNum: series?.episodeNum || null,
    duplicateWarning,
    kind: finalKind,
    deadline: finalKind === "trend" ? new Date(Date.now() + 24 * 36e5).toISOString() : null,
    scheduledDate: timing.scheduledDate || null,
    topic,
    payload,
    status: "draft",
    checklistState: payload.manual_publish_checklist.map(() => false),
    createdAt: new Date().toISOString(),
  });
}
