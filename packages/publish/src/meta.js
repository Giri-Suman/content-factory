import { loadEnv } from "../../shared/src/config.js";

/**
 * Instagram/Facebook Graph API container flow (P10.3). RUNTIME-GATED:
 * publishReel refuses unless META_APP_REVIEWED=true — until Meta's app
 * review clears, the Publish Center renders the manual checklist instead.
 * No scraping lives here or anywhere (permanent non-goal); this is the
 * official content-publishing API only.
 *
 * Env (when review clears): META_ACCESS_TOKEN, IG_USER_ID.
 * Flow: create media container (video_url or resumable) -> poll status ->
 * media_publish. Reels require a hosted video URL, so staged local files
 * must be uploaded somewhere reachable first — that wiring lands with the
 * review flag, not before.
 */

const GRAPH = "https://graph.facebook.com/v20.0";

export async function publishReel(item) {
  loadEnv();
  if (process.env.META_APP_REVIEWED !== "true") {
    throw new Error("Meta app not reviewed — Graph publishing is gated off (manual mode applies)");
  }
  const token = process.env.META_ACCESS_TOKEN;
  const igUser = process.env.IG_USER_ID;
  if (!token || !igUser) throw new Error("META_ACCESS_TOKEN / IG_USER_ID missing in .env");
  if (!item.assets?.videoUrl) throw new Error("Graph reel publishing needs a hosted video URL (assets.videoUrl)");

  const caption = [item.assets.caption, (item.assets.hashtags || []).join(" ")].filter(Boolean).join("\n\n");

  const containerRes = await fetch(`${GRAPH}/${igUser}/media`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ media_type: "REELS", video_url: item.assets.videoUrl, caption, access_token: token }),
  });
  if (!containerRes.ok) throw new Error(`container create failed ${containerRes.status}: ${(await containerRes.text()).slice(0, 200)}`);
  const { id: containerId } = await containerRes.json();

  // poll container until FINISHED (reels transcode server-side)
  for (let i = 0; i < 30; i++) {
    const st = await fetch(`${GRAPH}/${containerId}?fields=status_code&access_token=${token}`).then((r) => r.json());
    if (st.status_code === "FINISHED") break;
    if (st.status_code === "ERROR") throw new Error("container processing failed");
    await new Promise((r) => setTimeout(r, 10000));
  }

  const pub = await fetch(`${GRAPH}/${igUser}/media_publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ creation_id: containerId, access_token: token }),
  });
  if (!pub.ok) throw new Error(`media_publish failed ${pub.status}: ${(await pub.text()).slice(0, 200)}`);
  const { id: mediaId } = await pub.json();
  return `https://www.instagram.com/reel/${mediaId}`;
}
