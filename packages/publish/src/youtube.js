import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

/**
 * YouTube Data API v3 publisher. Raw HTTPS (no SDK) to keep deps at zero.
 * Uploads default to PRIVATE and set the altered/synthetic-content
 * disclosure. Public/unlisted only happens on an explicit privacyStatus.
 */

export async function getAccessToken() {
  const { YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN } = process.env;
  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
    throw new Error("missing YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN in .env (run: factory auth-youtube)");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: YT_CLIENT_ID,
      client_secret: YT_CLIENT_SECRET,
      refresh_token: YT_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).access_token;
}

/**
 * Build the videos.insert request body. `containsSyntheticMedia` is the
 * Data API surface of the "altered or synthetic content" disclosure; it's
 * set whenever the video has AI voice/visuals.
 */
export function buildInsertBody(meta, { publishAt } = {}) {
  const status = {
    privacyStatus: meta.privacyStatus || "private",
    selfDeclaredMadeForKids: false,
    containsSyntheticMedia: meta.synthetic !== false,
  };
  if (publishAt) {
    status.privacyStatus = "private"; // scheduled videos must be private until publishAt
    status.publishAt = new Date(publishAt).toISOString();
  }
  return {
    snippet: {
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
      categoryId: meta.categoryId || "28",
    },
    status,
  };
}

/** Resumable upload of a local MP4. Returns { videoId, url }. */
export async function uploadVideo(filePath, meta, { publishAt } = {}) {
  const accessToken = await getAccessToken();
  const body = buildInsertBody(meta, { publishAt });
  const size = statSync(filePath).size;

  // 1 — start a resumable session
  const startRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "X-Upload-Content-Length": String(size),
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify(body),
    }
  );
  if (!startRes.ok) throw new Error(`insert init failed ${startRes.status}: ${(await startRes.text()).slice(0, 300)}`);
  const uploadUrl = startRes.headers.get("location");
  if (!uploadUrl) throw new Error("no resumable upload URL returned");

  // 2 — stream the file bytes
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": "video/mp4", "content-length": String(size) },
    body: Readable.toWeb(createReadStream(filePath)),
    duplex: "half",
  });
  if (!putRes.ok) throw new Error(`upload failed ${putRes.status}: ${(await putRes.text()).slice(0, 300)}`);
  const result = await putRes.json();
  return { videoId: result.id, url: `https://youtu.be/${result.id}` };
}
