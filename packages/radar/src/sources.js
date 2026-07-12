/**
 * Trend ingestors. Each returns [{ source, title, url, points, comments, publishedAt }].
 * Every source is fault-isolated — one failing feed never kills the run.
 */

const UA = { "User-Agent": "content-factory-radar/0.1 (personal trend research)" };
const fetchOpts = { headers: UA, signal: AbortSignal.timeout(15000), redirect: "follow" };

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

export async function hackerNews() {
  const res = await fetch("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30", fetchOpts);
  if (!res.ok) throw new Error(`HN ${res.status}`);
  const data = await res.json();
  return (data.hits || []).map((h) => ({
    source: "hn",
    title: h.title || "",
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    points: h.points || 0,
    comments: h.num_comments || 0,
    publishedAt: h.created_at,
  }));
}

export async function githubTrending() {
  const res = await fetch("https://github.com/trending?since=daily", fetchOpts);
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
    items.push({
      source: "github",
      title: `${repo}${desc ? " — " + desc.slice(0, 160) : ""}`,
      url: `https://github.com/${repo}`,
      points: starsMatch ? parseInt(starsMatch[1].replace(/,/g, ""), 10) : 0,
      comments: 0,
      publishedAt: new Date().toISOString(),
    });
  }
  if (items.length === 0) throw new Error("GitHub trending: 0 items parsed (markup changed?)");
  return items;
}

const SUBREDDITS = ["programming", "webdev", "MachineLearning", "LocalLLaMA", "artificial"];

export async function reddit() {
  const items = [];
  for (const sub of SUBREDDITS) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=15`, fetchOpts);
      if (!res.ok) continue;
      const data = await res.json();
      for (const child of data?.data?.children || []) {
        const p = child.data;
        if (!p || p.stickied) continue;
        items.push({
          source: `r/${sub}`,
          title: p.title || "",
          url: `https://www.reddit.com${p.permalink}`,
          points: p.score || 0,
          comments: p.num_comments || 0,
          publishedAt: new Date(p.created_utc * 1000).toISOString(),
        });
      }
    } catch {
      /* one sub failing is fine */
    }
  }
  return items;
}

const FEEDS = [
  ["techcrunch", "https://techcrunch.com/feed/"],
  ["theverge", "https://www.theverge.com/rss/index.xml"],
  ["arstechnica", "https://feeds.arstechnica.com/arstechnica/index"],
];

function parseFeed(xml, source) {
  const items = [];
  const entries = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/g) || [];
  for (const entry of entries.slice(0, 20)) {
    const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    if (!titleMatch) continue;
    const title = decode(titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, ""));
    // RSS: <link>url</link>; Atom: <link href="url"/>
    const linkText = entry.match(/<link[^>]*>([\s\S]*?)<\/link>/);
    const linkHref = entry.match(/<link[^>]*href="([^"]+)"/);
    const url = (linkHref?.[1] || (linkText ? decode(linkText[1]) : "")).trim();
    const dateMatch = entry.match(/<(?:pubDate|published|updated)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated)>/);
    const publishedAt = dateMatch ? new Date(decode(dateMatch[1])).toISOString() : null;
    if (title && url) items.push({ source, title, url, points: 0, comments: 0, publishedAt });
  }
  return items;
}

export async function rssFeeds() {
  const items = [];
  for (const [name, feedUrl] of FEEDS) {
    try {
      const res = await fetch(feedUrl, fetchOpts);
      if (!res.ok) continue;
      items.push(...parseFeed(await res.text(), name));
    } catch {
      /* skip broken feed */
    }
  }
  return items;
}

export async function ingestAll() {
  const sources = [
    ["hn", hackerNews],
    ["github", githubTrending],
    ["reddit", reddit],
    ["rss", rssFeeds],
  ];
  const all = [];
  const failures = [];
  const results = await Promise.allSettled(sources.map(([, fn]) => fn()));
  results.forEach((r, i) => {
    if (r.status === "fulfilled") all.push(...r.value);
    else failures.push(`${sources[i][0]}: ${r.reason?.message || r.reason}`);
  });
  return { items: all, failures };
}
