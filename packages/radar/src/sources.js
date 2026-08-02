import { loadUserConfig } from "../../shared/src/config.js";

/**
 * Category-driven trend ingestors. The user picks niches in Mission Control
 * (data/config.json); each enabled category contributes its own sources and
 * every item is tagged with its category so scoring can match the audience.
 * Each source is fault-isolated — one failing feed never kills the run.
 */

const UA = { "User-Agent": "content-factory-radar/0.1 (personal trend research)" };
/**
 * MUST be a function. As a module-level const, `AbortSignal.timeout(15000)`
 * starts counting at import time and is SHARED by every request — so once a
 * collect run passes 15 seconds, every subsequent fetch aborts instantly with
 * a TimeoutError. The parallel burst at the start of ingestAll masked this
 * completely; only a sequential fetch afterwards ever hit it.
 */
const fetchOptions = () => ({ headers: UA, signal: AbortSignal.timeout(15000), redirect: "follow" });

export const CATEGORY_SOURCES = {
  coding: {
    label: "Coding / Dev",
    hn: true,
    github: true,
    subreddits: ["programming", "webdev", "reactjs", "SideProject"],
    feeds: [
      ["githubblog", "https://github.blog/feed/"],
      ["vercel", "https://vercel.com/atom"],
    ],
  },
  ai: {
    label: "AI / ML",
    hn: true,
    github: true,
    subreddits: ["MachineLearning", "LocalLLaMA", "artificial", "automation"],
    feeds: [
      ["techcrunch", "https://techcrunch.com/feed/"],
      ["theverge", "https://www.theverge.com/rss/index.xml"],
      ["arstechnica", "https://feeds.arstechnica.com/arstechnica/index"],
      ["openai", "https://openai.com/news/rss.xml"],
      ["anthropic", "https://www.anthropic.com/rss.xml"],
    ],
  },
  math: {
    label: "Math",
    subreddits: ["math", "mathematics", "learnmath"],
    feeds: [],
  },
  makeup: {
    label: "Makeup / Beauty",
    subreddits: ["MakeupAddiction", "beauty", "SkincareAddiction"],
    feeds: [["allure", "https://www.allure.com/feed/rss"]],
  },
};

const AI_HINT = /\b(ai|llm|gpt|claude|gemini|openai|anthropic|model|agent|neural|copilot|deepseek)\b/i;

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();

// HN and GitHub serve both coding and ai — tag per item by content
const techCategory = (text, enabled) => {
  if (enabled.includes("ai") && AI_HINT.test(text)) return "ai";
  return enabled.includes("coding") ? "coding" : "ai";
};

async function hackerNews(enabled) {
  const res = await fetch("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30", fetchOptions());
  if (!res.ok) throw new Error(`HN ${res.status}`);
  const data = await res.json();
  return (data.hits || []).map((h) => ({
    source: "hn",
    category: techCategory(h.title || "", enabled),
    title: h.title || "",
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    points: h.points || 0,
    comments: h.num_comments || 0,
    hnId: h.objectID, // needed to fetch the discussion; lost otherwise when h.url is set
    publishedAt: h.created_at,
  }));
}

/**
 * The discussion under a story — the only reachable source of real community
 * voice this project currently has. Reddit's JSON endpoint (which carries
 * selftext) is 403-blocked and its RSS gives link posts nothing but
 * "submitted by /u/x [link] [comments]", so without this, every captured
 * "quote" is a press release.
 *
 * Deliberately narrow: top stories only, a handful of comments each. This is
 * quote material for a script, not a scrape of the thread.
 */
export async function hnComments(hnId, { limit = 5 } = {}) {
  const res = await fetch(`https://hn.algolia.com/api/v1/search?tags=comment,story_${hnId}&hitsPerPage=${limit}`, fetchOptions());
  if (!res?.ok) return [];
  const data = await res.json();
  return (data.hits || [])
    .map((h) => ({
      text: decode(String(h.comment_text || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(),
      author: h.author ? `@${h.author}` : null,
    }))
    .filter((c) => c.text.length >= 40)
    .slice(0, limit);
}

async function githubTrending(enabled) {
  const res = await fetch("https://github.com/trending?since=daily", fetchOptions());
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const html = await res.text();
  const items = [];
  const articles = html.match(/<article class="Box-row">[\s\S]*?<\/article>/g) || [];
  for (const block of articles) {
    // the repo link lives in the <h2> heading; anchoring there skips sponsor/login links
    const heading = block.match(/<h2[^>]*>[\s\S]*?<\/h2>/)?.[0] || "";
    const repoMatch = heading.match(/href="\/([^\/"]+\/[^\/"?]+)"/);
    if (!repoMatch || repoMatch[1].startsWith("sponsors/")) continue;
    const repo = repoMatch[1];
    const descMatch = block.match(/<p class="col-9[^"]*">([\s\S]*?)<\/p>/);
    const starsMatch = block.match(/([\d,]+)\s+stars today/);
    const desc = descMatch ? decode(descMatch[1]) : "";
    const title = `${repo}${desc ? " — " + desc.slice(0, 160) : ""}`;
    items.push({
      source: "github",
      category: techCategory(title, enabled),
      title,
      url: `https://github.com/${repo}`,
      points: starsMatch ? parseInt(starsMatch[1].replace(/,/g, ""), 10) : 0,
      comments: 0,
      publishedAt: new Date().toISOString(),
    });
  }
  if (items.length === 0) throw new Error("GitHub trending: 0 items parsed (markup changed?)");
  return items;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// reddit blocks non-browser UAs for unauthenticated JSON; use a browser-style one there
// also a function — spreading fetchOptions() at module level would freeze the
// same already-counting AbortSignal it exists to avoid
const redditOptions = () => ({
  ...fetchOptions(),
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    Accept: "application/json",
  },
});

async function subreddit(sub, category) {
  // escalating fallbacks: www json (browser UA) → old json → www json with a
  // descriptive bot UA (reddit's rules prefer those) → hot.rss (no scores,
  // but keeps the source alive; velocity then comes from cross-source)
  const attempts = [
    [`https://www.reddit.com/r/${sub}/hot.json?limit=15`, redditOptions(), "json"],
    [`https://old.reddit.com/r/${sub}/hot.json?limit=15`, redditOptions(), "json"],
    [`https://www.reddit.com/r/${sub}/hot.json?limit=15`, { ...fetchOptions(), headers: { "User-Agent": "content-os/1.0", Accept: "application/json" } }, "json"],
    [`https://www.reddit.com/r/${sub}/hot.rss`, redditOptions(), "rss"],
  ];
  let lastStatus = "?";
  for (const [url, opts, kind] of attempts) {
    const res = await fetch(url, opts).catch(() => null);
    if (!res?.ok) {
      lastStatus = res ? res.status : "network";
      await sleep(700);
      continue;
    }
    if (kind === "rss") {
      return parseFeed(await res.text(), `r/${sub}`, category);
    }
    const data = await res.json();
    const items = [];
    for (const child of data?.data?.children || []) {
      const p = child.data;
      if (!p || p.stickied) continue;
      items.push({
        source: `r/${sub}`,
        category,
        title: p.title || "",
        url: `https://www.reddit.com${p.permalink}`,
        points: p.score || 0,
        comments: p.num_comments || 0,
        // The post's own words. Briefs were being written from headlines
        // alone, which is why hooks came out generic — a headline tells you
        // the topic, the body tells you how people actually talk about it.
        // Capped: this is quote material, not an archive.
        excerpt: String(p.selftext || "").replace(/\s+/g, " ").trim().slice(0, 600) || null,
        author: p.author ? `u/${p.author}` : null,
        publishedAt: new Date(p.created_utc * 1000).toISOString(),
      });
    }
    return items;
  }
  throw new Error(`r/${sub} ${lastStatus}`);
}

/** All subreddits fetched sequentially with a gap — parallel bursts get 403'd. */
async function redditAll(subs) {
  const items = [];
  const errors = [];
  for (const { sub, category } of subs) {
    try {
      items.push(...(await subreddit(sub, category)));
    } catch (e) {
      errors.push(`r/${sub}: ${e.message}`);
    }
    await sleep(400);
  }
  if (items.length === 0 && errors.length) throw new Error(errors.join("; "));
  return items;
}

function parseFeed(xml, source, category) {
  const items = [];
  const entries = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/g) || [];
  for (const entry of entries.slice(0, 20)) {
    const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    if (!titleMatch) continue;
    const title = decode(titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, ""));
    const linkText = entry.match(/<link[^>]*>([\s\S]*?)<\/link>/);
    const linkHref = entry.match(/<link[^>]*href="([^"]+)"/);
    const url = (linkHref?.[1] || (linkText ? decode(linkText[1]) : "")).trim();
    const dateMatch = entry.match(/<(?:pubDate|published|updated)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated)>/);
    const publishedAt = dateMatch ? new Date(decode(dateMatch[1])).toISOString() : null;

    // Body text, for quotes. Reddit's JSON endpoint is 403-blocked and the
    // chain falls back to RSS, so WITHOUT this the excerpt capture on the
    // JSON path would never actually fire for the source that needs it most.
    const bodyMatch = entry.match(/<(?:content|description|summary)[^>]*>([\s\S]*?)<\/(?:content|description|summary)>/);
    const excerpt = bodyMatch
      ? decode(bodyMatch[1].replace(/<!\[CDATA\[|\]\]>/g, ""))
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 600) || null
      : null;
    // Atom nests <author><name>x</name><uri>…</uri></author>; stripping tags
    // naively glues the name onto the URL ("/u/fooohttps://reddit.com/…").
    const authorMatch = entry.match(/<(?:author|dc:creator)[^>]*>([\s\S]*?)<\/(?:author|dc:creator)>/);
    const rawAuthor = authorMatch ? authorMatch[1] : "";
    const nameMatch = rawAuthor.match(/<name[^>]*>([\s\S]*?)<\/name>/);
    const author = (nameMatch ? nameMatch[1] : rawAuthor)
      ? decode((nameMatch ? nameMatch[1] : rawAuthor).replace(/<[^>]+>|<!\[CDATA\[|\]\]>/g, "")).trim().slice(0, 60) || null
      : null;

    if (title && url) items.push({ source, category, title, url, points: 0, comments: 0, excerpt, author, publishedAt });
  }
  return items;
}

async function rssFeed(name, feedUrl, category) {
  const res = await fetch(feedUrl, fetchOptions());
  if (!res.ok) throw new Error(`${name} ${res.status}`);
  return parseFeed(await res.text(), name, category);
}

export async function ingestAll({ github = true } = {}) {
  const config = loadUserConfig();
  const enabled = Object.entries(config.categories)
    .filter(([, on]) => on)
    .map(([name]) => name)
    .filter((name) => CATEGORY_SOURCES[name]);

  if (enabled.length === 0) {
    return { items: [], failures: ["no categories enabled — turn some on in Mission Control settings"], enabled };
  }

  const tasks = [];
  const wantHn = enabled.some((c) => CATEGORY_SOURCES[c].hn);
  const wantGithub = github && enabled.some((c) => CATEGORY_SOURCES[c].github);
  if (wantHn) tasks.push(["hn", () => hackerNews(enabled)]);
  if (wantGithub) tasks.push(["github", () => githubTrending(enabled)]);

  const redditSubs = [];
  for (const cat of enabled) {
    const src = CATEGORY_SOURCES[cat];
    for (const sub of src.subreddits || []) redditSubs.push({ sub, category: cat });
    for (const [name, feedUrl] of src.feeds || []) tasks.push([name, () => rssFeed(name, feedUrl, cat)]);
  }
  if (redditSubs.length) tasks.push(["reddit", () => redditAll(redditSubs)]);

  const all = [];
  const failures = [];
  const results = await Promise.allSettled(tasks.map(([, fn]) => fn()));
  results.forEach((r, i) => {
    if (r.status === "fulfilled") all.push(...r.value);
    else failures.push(`${tasks[i][0]}: ${r.reason?.message || r.reason}`);
  });

  // Attach the discussion to the busiest HN stories, as an excerpt. Capped at
  // 8 stories/run: this is quote material, not a thread archive, and each one
  // is a separate API call.
  const hot = all
    .filter((i) => i.hnId && (i.comments || 0) >= 15)
    .sort((a, b) => (b.comments || 0) - (a.comments || 0))
    .slice(0, 8);
  for (const story of hot) {
    try {
      const cs = await hnComments(story.hnId, { limit: 4 });
      if (!cs.length) continue;
      story.excerpt = cs.map((c) => c.text).join(" ").slice(0, 900);
      story.author = cs[0].author;
      story.voices = cs.map((c) => ({ author: c.author, text: c.text.slice(0, 240) }));
    } catch {
      /* a missing discussion must never fail the whole collect */
    }
  }

  return { items: all, failures, enabled };
}
