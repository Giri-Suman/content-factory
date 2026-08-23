import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv, repoRoot, NICHE_CONTEXT } from "../../shared/src/config.js";
import { collection, newId } from "../../shared/src/store.js";
import { chat, providerStatus } from "../../llm/src/llm.js";
import { preamble } from "./promptKit.js";

/**
 * P24 text composers. BlogComposer drafts a citation-optimized post (quick-
 * answer block + headers + author schema stub). NewsletterComposer compiles
 * Morning Digests + published posts into a markdown draft. Both land as
 * editable drafts — never auto-published. CommentMiner surfaces reply-worthy
 * comments from MY channel (needs YOUTUBE_API_KEY). Syndication pushes a
 * published blog to dev.to/Hashnode with rel=canonical.
 */

/* ---------------- BlogComposer ---------------- */

export async function composeBlog(briefId) {
  loadEnv();
  const brief = collection("briefs").get(briefId);
  if (!brief) throw new Error(`no brief ${briefId}`);
  const p = brief.payload || {};
  const outline = p.blog_outline || {};

  let body;
  if (providerStatus().active) {
    try {
      const res = await chat({
        task: "script",
        maxTokens: 5000,
        system:
          `Write a citation-optimized blog post for: ${NICHE_CONTEXT}. Structure: a 2-sentence quick-answer block ` +
          "up top, then H2 sections, code where relevant, an original-data angle." +
          preamble({ surface: "description", json: false }) +
          '\n\nReply ONLY JSON: {"title":"...","quick_answer":"...","sections":[{"h2":"...","body":"..."}],"data_angle":"..."}',
        user: `topic: ${brief.topic}\noutline: ${JSON.stringify(outline)}`,
      });
      body = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
    } catch {
      /* template */
    }
  }
  if (!body) {
    body = {
      title: outline.title || brief.topic,
      quick_answer: outline.quick_answer || "[fill: 2-sentence answer up top for featured-snippet capture]",
      sections: (outline.h2_sections || ["Setup", "The build", "Results"]).map((h) => ({ h2: h, body: "[fill: section body]" })),
      data_angle: outline.original_data_angle || "[fill: the data only you have]",
    };
  }

  // citation-optimized markdown + author schema stub
  const md = [
    `---\ntitle: "${body.title}"\nauthor: CoderFact\ncanonical: https://coderfact.com/blog/${briefId.slice(0, 8)}\nschema: BlogPosting\n---`,
    `# ${body.title}`,
    `> **Quick answer:** ${body.quick_answer}`,
    ...body.sections.map((s) => `## ${s.h2}\n\n${s.body}`),
    `## The data\n\n${body.data_angle}`,
  ].join("\n\n");

  const dir = path.join(repoRoot, "renders", `brief-${briefId.slice(0, 10)}`);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "blog.md");
  writeFileSync(file, md);

  // land as a draft Brief of kind "blog" for the edit pass
  collection("briefs").upsert(
    { id: newId(), kind: "blog", topic: `[blog] ${body.title}`, sourceBriefId: briefId, payload: { blog: body, file }, status: "draft", createdAt: new Date().toISOString() },
    (r) => r.sourceBriefId === briefId && r.kind === "blog"
  );
  return { file, title: body.title };
}

/* ---------------- NewsletterComposer ---------------- */

export function composeNewsletter() {
  loadEnv();
  const digests = collection("digests").all().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  const posts = collection("myposts").find((m) => !m.seed && Date.now() - new Date(m.postedAt).getTime() < 8 * 864e5);
  const week = new Date().toISOString().slice(0, 10);
  const md = [
    `# Builder's Brief — week of ${week}`,
    `_[from me: one human intro paragraph goes here]_`,
    `## What moved this week`,
    ...(digests[0]?.overnightRisers || []).slice(0, 5).map((r) => `- ${r.label} (+${r.delta})`),
    `## Shipped`,
    ...(posts.length ? posts.slice(0, 5).map((m) => `- ${m.title}`) : ["- (nothing published yet)"]),
    `## One script to steal\n\n[fill: paste-ready snippet]`,
  ].join("\n\n");

  const dir = path.join(repoRoot, "renders", "newsletter");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${week}.md`);
  writeFileSync(file, md);
  collection("newsletters").upsert({ id: week, week, file, at: new Date().toISOString() }, (r) => r.week);
  return { file, week };
}

/* ---------------- CommentMiner ---------------- */

export async function mineComments() {
  loadEnv();
  const { hasKey, yt } = await import("../../radar/src/youtube.js");
  if (!hasKey()) return { mined: 0, note: "no YOUTUBE_API_KEY" };
  const myPosts = collection("myposts").find((m) => !m.seed && m.platform === "youtube" && m.externalId).slice(-10);
  const flagged = [];
  for (const post of myPosts) {
    try {
      const data = await yt("commentThreads", { part: "snippet", videoId: post.externalId, maxResults: "20", order: "relevance" }, "comment-miner");
      for (const th of data.items || []) {
        const text = th.snippet?.topLevelComment?.snippet?.textDisplay || "";
        // reply-worthy = a question / objection / request
        if (/\?|how (do|can|to)|what about|can you|please|tutorial|explain|doesn'?t work/i.test(text)) {
          flagged.push({ videoId: post.externalId, title: post.title, comment: text.slice(0, 200), author: th.snippet?.topLevelComment?.snippet?.authorDisplayName });
        }
      }
    } catch {
      /* skip a video that errors */
    }
  }
  collection("commentleads").save(flagged.slice(0, 30).map((f) => ({ id: newId(), ...f, used: false, at: new Date().toISOString() })));
  return { mined: flagged.length };
}

/** One-click: a flagged comment -> a reply-video brief (format #12). */
export async function briefFromComment(leadId) {
  const lead = collection("commentleads").get(leadId);
  if (!lead) throw new Error("no such comment lead");
  const { generateBrief } = await import("./briefs.js");
  const brief = await generateBrief({ topic: `Reply: ${lead.comment.slice(0, 80)}` });
  collection("briefs").update(brief.id, { formatNum: 12, sourceComment: lead.comment });
  collection("commentleads").update(leadId, { used: true, briefId: brief.id });
  return brief;
}

/* ---------------- Syndication ---------------- */

export async function syndicate(blogBriefId, publishedUrl) {
  loadEnv();
  const brief = collection("briefs").get(blogBriefId);
  if (!brief || brief.kind !== "blog") throw new Error("not a published blog brief");
  const results = [];
  const canonical = publishedUrl;

  if (process.env.DEVTO_API_KEY) {
    try {
      const res = await fetch("https://dev.to/api/articles", {
        method: "POST",
        headers: { "api-key": process.env.DEVTO_API_KEY, "content-type": "application/json" },
        body: JSON.stringify({ article: { title: brief.payload.blog.title, body_markdown: `> Originally at ${canonical}\n\n`, canonical_url: canonical, published: true } }),
      });
      results.push({ platform: "dev.to", ok: res.ok, status: res.status });
    } catch (e) {
      results.push({ platform: "dev.to", ok: false, error: e.message });
    }
  } else results.push({ platform: "dev.to", ok: false, note: "DEVTO_API_KEY not set" });

  if (process.env.HASHNODE_API_KEY) results.push({ platform: "hashnode", ok: false, note: "wired — needs publication id" });
  else results.push({ platform: "hashnode", ok: false, note: "HASHNODE_API_KEY not set" });

  collection("syndications").save([...collection("syndications").all(), { id: newId(), blogBriefId, canonical, results, at: new Date().toISOString() }]);
  return { results };
}
