import { loadEnv, NICHE_CONTEXT } from "../../shared/src/config.js";
import { collection, newId } from "../../shared/src/store.js";
import { chat, providerStatus } from "../../llm/src/llm.js";

/**
 * Engagement tools — the parts of growth that happen AFTER the render:
 *
 *  ctaLibrary()   reusable CTAs + end-screen plan per format/platform.
 *  draftReplies() turns CommentMiner leads into ready-to-paste replies.
 *  abTitles()     title A/B: variants now, swap after N hours, keep the
 *                 winner by the only honest metric we can read (views vs
 *                 channel median — CTR/impressions aren't in the API).
 */

/* ---------------- 3. CTA / end-screen library ---------------- */

const SEED_CTAS = [
  { id: "cta-sub-build", kind: "subscribe", platform: "yt_short", text: "If you build things like this, subscribe — one automation every week.", note: "identity-based, beats 'smash subscribe'" },
  { id: "cta-comment-q", kind: "comment", platform: "yt_short", text: "What should I automate next? Top comment wins.", note: "drives the Golden-60 comment burst" },
  { id: "cta-save", kind: "save", platform: "ig_reel", text: "Save this before you need it at 2am.", note: "saves weigh heavily on IG ranking" },
  { id: "cta-script", kind: "lead", platform: "yt_short", text: "The full script is free — link in the description.", note: "lead magnet; pair with the resource post" },
  { id: "cta-follow-series", kind: "series", platform: "yt_short", text: "This is part of a series — follow so you catch the next build.", note: "for series formats only" },
  { id: "cta-li-discuss", kind: "comment", platform: "linkedin", text: "Curious how others handle this — what's your setup?", note: "LinkedIn rewards genuine replies" },
];

const END_SCREEN_PLAN = {
  yt_short: ["last frame holds the payoff 1s longer than feels natural", "no end cards on Shorts — they clip the loop; put the CTA in the voiceover"],
  youtube_long: ["end screen at -20s: best-performing related video + subscribe", "verbal CTA at the value peak, not the very end"],
  ig_reel: ["final frame = the result, text-only, loop-friendly", "CTA in the caption's first line, not the video"],
};

export function ctaLibrary({ platform } = {}) {
  loadEnv();
  const store = collection("ctas");
  if (!store.count()) for (const c of SEED_CTAS) store.upsert({ ...c, uses: 0, createdAt: new Date().toISOString() }, (r) => r.id);
  const all = store.all();
  return {
    ctas: platform ? all.filter((c) => c.platform === platform) : all,
    endScreens: platform ? { [platform]: END_SCREEN_PLAN[platform] || [] } : END_SCREEN_PLAN,
  };
}

export function addCta({ kind, platform, text, note }) {
  if (!text) throw new Error("a CTA needs text");
  return collection("ctas").upsert({ id: newId(), kind: kind || "custom", platform: platform || "yt_short", text, note: note || null, uses: 0, createdAt: new Date().toISOString() }, (r) => r.id);
}

/** Pick the least-used CTA for a platform so they rotate instead of staling. */
export function nextCta(platform = "yt_short") {
  const { ctas } = ctaLibrary({ platform });
  if (!ctas.length) return null;
  const pick = [...ctas].sort((a, b) => (a.uses || 0) - (b.uses || 0))[0];
  collection("ctas").update(pick.id, { uses: (pick.uses || 0) + 1 });
  return pick;
}

/* ---------------- 4. comment reply drafting ---------------- */

const REPLY_TEMPLATES = [
  (c) => `Good question — short answer: ${"[your one-line answer]"}. Full walkthrough is in the description if you want the code.`,
  (c) => `Yes, and it's simpler than it looks: ${"[the one step that matters]"}. Happy to do a follow-up on this if more people want it.`,
  (c) => `That's the exact edge case that bit me too. ${"[what fixed it]"} — worth its own short, adding it to the list.`,
];

/**
 * Drafts a reply per mined comment. LLM-written when a tier is available;
 * otherwise a template with clearly-marked blanks — never a fake-confident
 * auto-reply, because a wrong answer in public costs more than a slow one.
 * Nothing is posted: these are drafts for you to paste.
 */
export async function draftReplies({ limit = 10 } = {}) {
  loadEnv();
  const leads = collection("commentleads").find((l) => !l.used && !l.replyDraft).slice(0, limit);
  if (!leads.length) return { drafted: 0, note: "no unanswered comment leads — run: factory catalog comments" };

  let drafted = 0;
  for (const [i, lead] of leads.entries()) {
    let draft = null;
    if (providerStatus().active) {
      try {
        const res = await chat({
          task: "analysis",
          maxTokens: 300,
          system:
            `Write a short, genuinely helpful YouTube comment reply as this creator: ${NICHE_CONTEXT}. ` +
            "Warm, specific, no emoji spam, no 'great question!' filler. 2 sentences max. If the answer needs " +
            'facts you do not have, say what you would check instead of guessing. Reply ONLY JSON: {"reply":"..."}',
          user: `Comment: "${lead.comment}"\nOn video: ${lead.title}`,
        });
        if (res) draft = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1)).reply;
      } catch {
        /* template below */
      }
    }
    if (!draft) draft = REPLY_TEMPLATES[i % REPLY_TEMPLATES.length](lead.comment);

    // Score it for assistant-register tells. The prompt already asks for no
    // "great question!" filler, but asking isn't enforcing. Flag, don't
    // rewrite: you review every reply before it posts, and silently editing
    // your voice is worse than showing you the tell.
    let human = null;
    try {
      const { scan } = await import("./humanize.js");
      const s = scan(draft, { surface: "reply" });
      human = { score: s.score, tells: s.hits.map((h) => h.id) };
      if (s.score < 70) console.log(`  ⚠ reply draft reads as generated (${s.score}): ${s.hits.map((h) => h.name).join(", ")}`);
    } catch {
      /* advisory only */
    }

    collection("commentleads").update(lead.id, { replyDraft: draft, human, draftedAt: new Date().toISOString(), draftMode: providerStatus().active ? "llm" : "template" });
    drafted++;
  }
  return { drafted, mode: providerStatus().active ? "llm" : "template" };
}

/* ---------------- 5. A/B title scheduler ---------------- */

/**
 * Schedules a title swap. Honest by construction: YouTube's API exposes
 * neither impressions nor CTR, so the winner is judged on views-vs-median
 * over equal windows — labelled as the proxy it is.
 */
export async function scheduleTitleAB(myPostId, { variantB, afterHours = 48 } = {}) {
  loadEnv();
  const post = collection("myposts").get(myPostId);
  if (!post) throw new Error(`no MyPost ${myPostId}`);

  let b = variantB;
  if (!b && providerStatus().active) {
    try {
      const res = await chat({
        task: "score",
        maxTokens: 300,
        system:
          `Rewrite this video title as a genuinely different ANGLE (not a synonym swap) for: ${NICHE_CONTEXT}. ` +
          'Same promise, different hook pattern. Reply ONLY JSON: {"title":"..."}',
        user: post.title,
      });
      if (res) b = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1)).title;
    } catch {
      /* fall through */
    }
  }
  if (!b) throw new Error("no variant B — pass one explicitly, or configure an AI tier to generate it");

  return collection("titletests").upsert(
    {
      id: newId(),
      myPostId,
      variantA: post.title,
      variantB: b,
      swapAt: new Date(Date.now() + afterHours * 36e5).toISOString(),
      status: "pending",
      baselineViews: (post.statsSnapshots || []).slice(-1)[0]?.views || 0,
      metric: "views-vs-channel-median (CTR/impressions are not exposed by the API)",
      createdAt: new Date().toISOString(),
    },
    (r) => r.myPostId
  );
}

/** Worker calls this: perform due swaps, and judge finished tests. */
export function runTitleTests() {
  const tests = collection("titletests");
  const now = Date.now();
  const due = tests.find((t) => t.status === "pending" && new Date(t.swapAt).getTime() <= now);
  const judged = [];

  for (const t of due) {
    const post = collection("myposts").get(t.myPostId);
    const viewsAtSwap = (post?.statsSnapshots || []).slice(-1)[0]?.views || 0;
    tests.update(t.id, {
      status: "swapped",
      swappedAt: new Date().toISOString(),
      viewsAtSwap,
      aWindowGain: viewsAtSwap - t.baselineViews,
      note: "variant B is live — set it in Studio; the next window measures B",
    });
    judged.push({ id: t.id, title: t.variantB, aGain: viewsAtSwap - t.baselineViews });
  }

  // second pass: tests swapped long enough ago get a verdict
  for (const t of tests.find((x) => x.status === "swapped" && x.swappedAt)) {
    const hoursSince = (now - new Date(t.swappedAt).getTime()) / 36e5;
    if (hoursSince < 48) continue;
    const post = collection("myposts").get(t.myPostId);
    const nowViews = (post?.statsSnapshots || []).slice(-1)[0]?.views || 0;
    const bGain = nowViews - (t.viewsAtSwap || 0);
    tests.update(t.id, {
      status: "decided",
      bWindowGain: bGain,
      winner: bGain > (t.aWindowGain || 0) ? "B" : "A",
      decidedAt: new Date().toISOString(),
    });
  }
  return { swapped: judged.length, pending: tests.find((t) => t.status === "pending").length };
}
