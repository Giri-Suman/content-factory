/**
 * A record of every place the pipeline quietly settled for less.
 *
 * WHY THIS EXISTS: the expensive stages all degrade rather than fail, which is
 * the right instinct - a paid voice being down should not kill a render. The
 * problem was that degrading left no trace a machine could read. ElevenLabs
 * failing wrote one console line and substituted Windows TTS; loudnorm failing
 * wrote nothing at all and shipped an unnormalised file. Both produce a video
 * that looks finished, passes its judges, and is worse than the one you paid
 * for - and you find out from a viewer.
 *
 * So a degradation is now a fact on disk, attached to the render it damaged,
 * and the AudioJudge reads it. The rule this encodes: it is fine to degrade,
 * it is not fine to degrade silently.
 */

import { collection } from "./store.js";

/**
 * Note that `renderId` came out worse than requested.
 *
 * Best-effort by design: recording a problem must never become a second
 * problem, so a failure to write is swallowed rather than aborting a render
 * that has otherwise succeeded.
 */
export function noteDegradation(renderId, stage, detail) {
  if (!renderId) return null;
  try {
    return collection("degradations").upsert(
      {
        id: `${renderId}:${stage}`,
        renderId: String(renderId),
        stage,
        detail: String(detail).slice(0, 300),
        at: new Date().toISOString(),
      },
      (r) => r.id
    );
  } catch {
    return null;
  }
}

/** Everything recorded against one render. */
export function degradationsFor(renderId) {
  if (!renderId) return [];
  try {
    return collection("degradations").find((d) => d.renderId === String(renderId));
  } catch {
    return [];
  }
}

/** Forget a render's history, so a clean re-run is not judged on the old one. */
export function clearDegradations(renderId) {
  if (!renderId) return 0;
  try {
    const c = collection("degradations");
    const mine = c.find((d) => d.renderId === String(renderId));
    for (const row of mine) c.remove(row.id);
    return mine.length;
  } catch {
    return 0;
  }
}
