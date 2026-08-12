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
    showHN: true, // people demoing what they BUILT — the comments say if it's real
    github: true,
    githubNew: true, // new repos that got popular fast, before the launch posts
    subreddits: ["programming", "webdev", "reactjs", "SideProject"],
    feeds: [
      ["githubblog", "https://github.blog/feed/"],
      ["vercel", "https://vercel.com/atom"],
      ["producthunt", "https://www.producthunt.com/feed"],
    ],
  },
  ai: {
    label: "AI / ML",
    hn: true,
    showHN: true,
    github: true,
    githubNew: true,
    // LocalLLaMA and AI_Agents are the build-signal subs — actual working
    // projects rather than announcements
    subreddits: ["MachineLearning", "LocalLLaMA", "AI_Agents", "artificial", "automation"],
    feeds: [
      ["techcrunch", "https://techcrunch.com/feed/"],
      ["theverge", "https://www.theverge.com/rss/index.xml"],
      ["arstechnica", "https://feeds.arstechnica.com/arstechnica/index"],
      ["openai", "https://openai.com/news/rss.xml"],
      ["anthropic", "https://www.anthropic.com/rss.xml"],
      ["producthunt", "https://www.producthunt.com/feed"],
      /**
       * Newsletter lane. These writers monitor X full-time, so their digests
       * are the cheapest legitimate proxy for X signal — no scraping, no API
       * cost, no ToS problem. RSS beats the Gmail-parsing plan outright where
       * a feed exists: no OAuth, no inbox dependency, no HTML-email parsing.
       * The Rundown has no working public feed (checked /feed, /rss, /rss.xml
       * and the beehiiv subdomain — all 404 or non-RSS), so it is deliberately
       * absent rather than half-built.
       */
      ["bensbites", "https://www.bensbites.com/feed"],
      ["tldr-ai", "https://tldr.tech/api/rss/ai"],
      ["tldr-tech", "https://tldr.tech/api/rss/tech"],
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

/**
 * Show HN — people demoing what they actually built, with a comment thread
 * that tells you whether it's real. Front-page HN surfaces these only once
 * they're already big; this lane catches them while they're still small,
 * which is the whole point.
 */
async function showHackerNews(enabled) {
  const res = await fetch("https://hn.algolia.com/api/v1/search?tags=show_hn&hitsPerPage=25", fetchOptions());
  if (!res.ok) throw new Error(`Show HN ${res.status}`);
  const data = await res.json();
  return (data.hits || []).map((h) => ({
    source: "hn-show",
    category: techCategory(h.title || "", enabled),
    title: h.title || "",
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    points: h.points || 0,
    comments: h.num_comments || 0,
    hnId: h.objectID, // so the discussion attaches as quote material
    publishedAt: h.created_at,
  }));
}

/**
 * New repos that got popular fast — tools before anyone writes the launch post.
 *
 * GitHub's search API exposes no stars-DELTA, so "stars gained this week" is
 * not directly queryable. `created:>7d sort=stars` is the honest proxy: a repo
 * that did not exist a week ago and already has hundreds of stars gained them
 * this week by definition. Real per-hour velocity then comes from this repo's
 * own snapshot mechanism once the item is tracked, which is better than any
 * single-shot number a search could return.
 *
 * Keyless: 10 requests/minute unauthenticated, and this is one call per run.
 */
async function githubNew(enabled) {
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const q = encodeURIComponent(`created:>${since} stars:>40`);
  const res = await fetch(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=25`, {
    ...fetchOptions(),
    headers: { ...UA, Accept: "application/vnd.github+json" },
  });
  if (res.status === 403) throw new Error("GitHub search: rate-limited (60/h unauthenticated)");
  if (!res.ok) throw new Error(`GitHub search ${res.status}`);
  const data = await res.json();
  return (data.items || []).map((r) => ({
    source: "github-new",
    category: techCategory(`${r.name} ${r.description || ""}`, enabled),
    title: `${r.full_name}${r.description ? " — " + r.description.slice(0, 160) : ""}`,
    url: r.html_url,
    points: r.stargazers_count || 0,
    comments: r.open_issues_count || 0,
    excerpt: r.description || null, // quote material + entity grounding
    publishedAt: r.created_at,
  }));
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

async function subreddit(sub, category, memo = { winner: null }, token = null) {
  // authenticated path: one request, real scores, 100 QPM
  if (token) {
    const res = await fetch(`https://oauth.reddit.com/r/${sub}/hot?limit=15`, {
      headers: { Authorization: `Bearer ${token}`, ...UA },
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      return (data?.data?.children || [])
        .map((c) => c.data)
        .filter((p) => p && !p.stickied)
        .map((p) => ({
          source: `r/${sub}`,
          category,
          title: p.title || "",
          url: `https://www.reddit.com${p.permalink}`,
          points: p.score || 0,
          comments: p.num_comments || 0,
          excerpt: String(p.selftext || "").replace(/\s+/g, " ").trim().slice(0, 600) || null,
          author: p.author ? `u/${p.author}` : null,
          publishedAt: new Date(p.created_utc * 1000).toISOString(),
        }));
    }
    // token rejected — fall through to the keyless attempts below
  }

  // escalating fallbacks: www json (browser UA) → old json → www json with a
  // descriptive bot UA (reddit's rules prefer those) → hot.rss (no scores,
  // but keeps the source alive; velocity then comes from cross-source)
  const attempts = [
    [`https://www.reddit.com/r/${sub}/hot.json?limit=15`, redditOptions(), "json"],
    [`https://old.reddit.com/r/${sub}/hot.json?limit=15`, redditOptions(), "json"],
    [`https://www.reddit.com/r/${sub}/hot.json?limit=15`, { ...fetchOptions(), headers: { "User-Agent": "content-os/1.0", Accept: "application/json" } }, "json"],
    [`https://www.reddit.com/r/${sub}/hot.rss`, redditOptions(), "rss"],
  ];
  // a strategy that worked for one sub works for the rest — try it first and
  // skip the endpoints already known to be refused
  const order = memo.winner === null ? attempts.keys() : [memo.winner, ...[...attempts.keys()].filter((i) => i !== memo.winner)];
  let lastStatus = "?";
  for (const idx of order) {
    const [url, opts, kind] = attempts[idx];
    const res = await fetch(url, opts).catch(() => null);
    if (!res?.ok) {
      lastStatus = res ? res.status : "network";
      // 429 means "slow down", not "try a different endpoint" — hitting the
      // next one immediately just deepens the throttle
      await sleep(res?.status === 429 ? 3000 : 700);
      continue;
    }
    memo.winner = idx;
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
/**
 * Reddit OAuth. A free personal "script" app gives 100 queries/minute, which
 * collects every sub on every run. Without it, unauthenticated access is
 * effectively dead — measured, 1 of 5 subs succeeded at BOTH 5s and 9s
 * spacing, so this is not a pacing problem and no backoff fixes it.
 *
 * Setup: reddit.com/prefs/apps → create app → type "script" → put the id and
 * secret in .env as REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET.
 */
let _redditToken = null;
async function redditToken() {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (_redditToken && _redditToken.expires > Date.now() + 60000) return _redditToken.token;
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...UA,
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const d = await res.json();
  if (!d.access_token) return null;
  _redditToken = { token: d.access_token, expires: Date.now() + (d.expires_in || 3600) * 1000 };
  return _redditToken.token;
}

/**
 * Keyless Reddit gets a ROTATING WINDOW rather than a doomed full sweep:
 * collecting 3 subs properly beats failing 15. The cursor advances each run,
 * so every sub is covered over a few passes — and the collector runs every
 * 30 minutes, so full coverage lands within ~2 hours. With OAuth configured,
 * the window is dropped and everything collects every run.
 */
const KEYLESS_WINDOW = 3;

async function redditAll(subs) {
  const items = [];
  const errors = [];
  const token = await redditToken();

  let batch = subs;
  if (!token && subs.length > KEYLESS_WINDOW) {
    const { readCursor, writeCursor } = await import("./db.js");
    const cur = readCursor("redditRotate") || 0;
    batch = Array.from({ length: KEYLESS_WINDOW }, (_, k) => subs[(cur + k) % subs.length]);
    writeCursor("redditRotate", (cur + KEYLESS_WINDOW) % subs.length);
    console.log(`  reddit: keyless, rotating ${KEYLESS_WINDOW}/${subs.length} this run (${batch.map((b) => b.sub).join(", ")})`);
    console.log(`          add REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET to collect all of them every run`);
  }

  const memo = { winner: null }; // a strategy that works for one sub works for all
  for (const [i, { sub, category }] of batch.entries()) {
    if (i > 0) await sleep(token ? 700 : 2500);
    try {
      items.push(...(await subreddit(sub, category, memo, token)));
    } catch (e) {
      errors.push(`r/${sub}: ${e.message}`);
    }
  }
  if (items.length === 0 && errors.length) throw new Error(errors.join("; "));
  if (errors.length) console.log(`  (reddit: ${batch.length - errors.length}/${batch.length} collected)`);
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
  const wantShowHn = enabled.some((c) => CATEGORY_SOURCES[c].showHN);
  const wantGithub = github && enabled.some((c) => CATEGORY_SOURCES[c].github);
  const wantGithubNew = github && enabled.some((c) => CATEGORY_SOURCES[c].githubNew);
  if (wantHn) tasks.push(["hn", () => hackerNews(enabled)]);
  if (wantShowHn) tasks.push(["hn-show", () => showHackerNews(enabled)]);
  if (wantGithub) tasks.push(["github", () => githubTrending(enabled)]);
  if (wantGithubNew) tasks.push(["github-new", () => githubNew(enabled)]);

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
