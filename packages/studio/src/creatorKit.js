import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv, repoRoot, NICHE_CONTEXT } from "../../shared/src/config.js";
import { collection, newId } from "../../shared/src/store.js";
import { chat, providerStatus } from "../../llm/src/llm.js";

/**
 * The rest of the universal creator kit — the things every niche needs and
 * the pipeline didn't have:
 *
 *  translateCaptions()  one .srt -> many languages. The biggest free reach
 *                       unlock for visual niches (a nail tutorial plays in
 *                       any language; only the captions are the barrier).
 *  pacingCheck()        will this script actually fit 30s? Read-time math
 *                       before you record, not after.
 *  linkKit()            affiliate/product links with UTM tags — how makeup,
 *                       nail and tool-review creators actually earn.
 *  stockSearch()        b-roll + music from free-licence libraries.
 */

/* ---------------- 1. multi-language captions ---------------- */

// languages worth having by default: reach per unit of effort
export const LANGS = { es: "Spanish", hi: "Hindi", pt: "Portuguese", id: "Indonesian", ar: "Arabic", fr: "French", de: "German", ja: "Japanese" };

function parseSrt(text) {
  return text
    .trim()
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const time = lines.find((l) => l.includes("-->"));
      if (!time) return null;
      return { time, text: lines.slice(lines.indexOf(time) + 1).join(" ").trim() };
    })
    .filter(Boolean);
}

export async function translateCaptions(renderId, langs = ["es", "hi"]) {
  loadEnv();
  const srtPath = path.join(repoRoot, "renders", renderId, "captions.srt");
  if (!existsSync(srtPath)) throw new Error(`no captions.srt for ${renderId} — run: factory tools captions ${renderId}`);
  const cues = parseSrt(readFileSync(srtPath, "utf8"));
  if (!cues.length) throw new Error("captions.srt has no cues");
  if (!providerStatus().active) {
    throw new Error("translation needs an AI tier — the free tier costs $0 (see: factory ai)");
  }

  const made = [];
  for (const code of langs) {
    const name = LANGS[code] || code;
    let translated = null;
    try {
      const res = await chat({
        task: "analysis",
        maxTokens: 4000,
        system:
          `Translate video captions to ${name} for: ${NICHE_CONTEXT}. Keep technical terms and product names in the ` +
          "original where a native speaker would. Match the line count EXACTLY — one output line per input line, same " +
          'order, no numbering. Reply ONLY JSON: {"lines":["...","..."]}',
        user: cues.map((c, i) => `${i + 1}. ${c.text}`).join("\n"),
      });
      const parsed = JSON.parse(res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1));
      if (Array.isArray(parsed.lines) && parsed.lines.length === cues.length) translated = parsed.lines;
      else if (Array.isArray(parsed.lines)) {
        // count drift: pad/trim rather than silently misalign the timing
        translated = cues.map((_, i) => parsed.lines[i] || cues[i].text);
      }
    } catch (e) {
      console.error(`  ${name}: failed (${String(e.message).slice(0, 60)})`);
      continue;
    }
    if (!translated) continue;
    const out = path.join(repoRoot, "renders", renderId, `captions.${code}.srt`);
    writeFileSync(out, cues.map((c, i) => `${i + 1}\n${c.time}\n${translated[i]}\n`).join("\n"));
    made.push({ code, name, file: out, cues: cues.length });
  }
  return { renderId, cues: cues.length, made };
}

/* ---------------- 2. pacing / read-time check ---------------- */

const WPS = 2.5; // conversational narration, words per second

export function pacingCheck(text, { targetSec = 32 } = {}) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const estSec = Math.round((words.length / WPS) * 10) / 10;
  const delta = Math.round((estSec - targetSec) * 10) / 10;
  const trimWords = delta > 0 ? Math.ceil(delta * WPS) : 0;
  return {
    words: words.length,
    estSec,
    targetSec,
    delta,
    verdict: Math.abs(delta) <= targetSec * 0.1 ? "on target" : delta > 0 ? "too long" : "too short",
    advice:
      delta > 0
        ? `cut ~${trimWords} words (${delta}s over) — usually the setup sentence, not the payoff`
        : delta < -targetSec * 0.1
          ? `room for ~${Math.ceil(Math.abs(delta) * WPS)} more words — add a concrete detail, not filler`
          : "good — record it",
  };
}

/** Pacing for a whole brief, per scene, so you know WHICH beat is bloated. */
export function pacingForBrief(briefId) {
  const brief = collection("briefs").get(briefId);
  if (!brief) throw new Error(`no brief ${briefId}`);
  const p = brief.payload || {};
  const target = p.yt_short?.length_sec || 32;
  const parts = [
    ["hook", p.yt_short?.hook_variants?.[0] || ""],
    ...(p.yt_short?.beats || []).map((b, i) => [`beat ${i + 1}`, b]),
  ].filter(([, t]) => t);
  const perPart = parts.map(([name, t]) => ({ name, ...pacingCheck(t, { targetSec: target / Math.max(1, parts.length) }) }));
  const whole = pacingCheck(parts.map(([, t]) => t).join(" "), { targetSec: target });
  return { briefId, target, whole, perPart };
}

/* ---------------- 3. link kit (affiliate / UTM) ---------------- */

export function addLink({ label, url, kind = "product", niche = null }) {
  if (!label || !url) throw new Error("a link needs a label and a url");
  return collection("links").upsert(
    { id: newId(), label, url, kind, niche, clicks: 0, createdAt: new Date().toISOString() },
    (r) => r.label.toLowerCase() === label.toLowerCase()
  );
}

/**
 * Build the description link block. Adds UTM tags so you can actually tell
 * which video drove a click — the thing most creators never set up.
 */
export function linkKit({ platform = "youtube", videoId = "video", niche = null } = {}) {
  const links = collection("links").find((l) => !niche || !l.niche || l.niche === niche);
  const tagged = links.map((l) => {
    const sep = l.url.includes("?") ? "&" : "?";
    const utm = `utm_source=${platform}&utm_medium=video&utm_campaign=${encodeURIComponent(videoId)}`;
    return { ...l, tracked: `${l.url}${sep}${utm}` };
  });
  const block = tagged.length
    ? tagged.map((l) => `${l.label}: ${l.tracked}`).join("\n")
    : "(no links yet — factory tools link add \"<label>\" <url>)";
  const disclosure = tagged.some((l) => l.kind === "affiliate")
    ? "\n\nSome links are affiliate links — they cost you nothing and support the channel. Required disclosure, and honest practice."
    : "";
  return { links: tagged, block: block + disclosure, count: tagged.length };
}

/* ---------------- 4. stock b-roll + music (free licences) ---------------- */

/**
 * Searches free-licence libraries. Env-gated because both need a free key;
 * with no key we return the direct search URLs so the tool is still useful
 * instead of just failing.
 */
export async function stockSearch(query, { kind = "video", limit = 8 } = {}) {
  loadEnv();
  const key = process.env.PEXELS_API_KEY;
  const fallback = {
    query,
    kind,
    keyless: true,
    note: "no PEXELS_API_KEY — here are the direct searches (all free-licence, attribution-free)",
    links:
      kind === "music"
        ? [
            { source: "Pixabay Music", url: `https://pixabay.com/music/search/${encodeURIComponent(query)}/` },
            { source: "Free Music Archive", url: `https://freemusicarchive.org/search?quicksearch=${encodeURIComponent(query)}` },
            { source: "YouTube Audio Library", url: "https://studio.youtube.com/channel/UC/music" },
          ]
        : [
            { source: "Pexels", url: `https://www.pexels.com/search/${kind === "video" ? "videos/" : ""}${encodeURIComponent(query)}/` },
            { source: "Pixabay", url: `https://pixabay.com/${kind === "video" ? "videos" : "images"}/search/${encodeURIComponent(query)}/` },
          ],
  };
  if (!key || kind === "music") return fallback;

  try {
    const endpoint = kind === "video" ? "https://api.pexels.com/videos/search" : "https://api.pexels.com/v1/search";
    const res = await fetch(`${endpoint}?query=${encodeURIComponent(query)}&per_page=${limit}`, {
      headers: { Authorization: key },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { ...fallback, note: `Pexels ${res.status} — falling back to search links` };
    const data = await res.json();
    const items = (kind === "video" ? data.videos : data.photos) || [];
    return {
      query,
      kind,
      keyless: false,
      results: items.map((it) => ({
        id: it.id,
        by: it.user?.name,
        preview: kind === "video" ? it.video_files?.find((f) => f.quality === "hd")?.link || it.video_files?.[0]?.link : it.src?.large,
        page: it.url,
        duration: it.duration,
      })),
    };
  } catch (e) {
    return { ...fallback, note: `lookup failed (${String(e.message).slice(0, 50)}) — use the search links` };
  }
}
