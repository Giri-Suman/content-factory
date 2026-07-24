import { loadEnv } from "../../shared/src/config.js";
import { collection } from "../../shared/src/store.js";

/**
 * P24 repurposing fan-out (catalog 4.2). On brief approval, one core idea
 * spawns every derivative asset: the video's 3 platform profiles are
 * handled by the render profiles; here we create/prep the near-zero-cost
 * text + carousel derivatives so 1 idea/day => many assets/week. Judges
 * still gate each before "ready" (the SEO-completeness gate in the
 * orchestrator). Nothing here auto-publishes.
 */

export async function fanOut(briefId) {
  loadEnv();
  const brief = collection("briefs").get(briefId);
  if (!brief) throw new Error(`no brief ${briefId}`);
  const p = brief.payload || {};
  const items = collection("publishitems");
  const created = [];

  // the video PublishItems (yt/ig/li/x) come from sendToCenter; fan-out adds
  // the derivative rails: carousel, blog draft, newsletter queue, syndication.
  const derivatives = [
    ["ig_carousel", Boolean(p.ig_carousel?.slides?.length), { slides: p.ig_carousel?.slides || [], cover_text: p.ig_carousel?.cover_text }],
    ["blog", Boolean(p.blog_outline?.title), { outline: p.blog_outline }],
    ["newsletter_queue", true, { queuedFor: "weekly compile" }],
    ["pinterest", Boolean(p.blog_outline?.h2_sections?.length), { ratio: "2:3" }],
  ];

  for (const [platform, ready, assets] of derivatives) {
    if (items.find((i) => i.briefId === briefId && i.platform === platform).length) continue;
    items.upsert({
      id: `${briefId}-${platform}`,
      briefId,
      topic: brief.topic,
      platform,
      mode: "staged",
      derivative: true,
      assets: { ...assets, prepared: ready },
      status: ready ? "preparing" : "blocked-incomplete",
      createdAt: new Date().toISOString(),
    });
    created.push(platform);
  }

  // queue the newsletter item + flag the blog for BlogComposer
  collection("newsletterqueue").upsert({ id: briefId, briefId, topic: brief.topic, at: new Date().toISOString() }, (r) => r.briefId);

  collection("briefs").update(briefId, { fannedOut: true, derivativeCount: created.length });
  return { briefId, derivatives: created, totalAssets: 4 + created.length }; // 4 video/text rails + derivatives
}
