/**
 * HEARTBEAT — so the public page can say what is actually going on.
 *
 * Without this the page can only list finished files, which leaves the obvious
 * questions unanswered: is my request being worked on? is the laptop even on?
 * when will it run? "Nothing here yet" reads identically to "it is broken".
 *
 * The laptop writes a small JSON file to R2 whenever it wakes, starts a job,
 * finishes one, and goes idle. The page reads it and can then say "asleep, next
 * run at 14:00" rather than saying nothing.
 *
 * WHY R2 AND NOT A PING: the page is static and the laptop is usually asleep, so
 * there is nothing to ping. A file written by whoever was last awake is the only
 * thing both sides can see.
 *
 * Timestamps are ISO strings, and every duration shown to a person is computed
 * from them at read time — never precomputed here, because this file may be
 * hours stale by the time anyone reads it. That staleness IS the signal.
 */

import { isConfigured, presignGet, putObject } from "./r2.js";

const KEY = "status/heartbeat.json";

/** Scheduled wake times, kept here so the page and the task agree on one source. */
export const WAKE_TIMES = (process.env.FACTORY_WAKE_TIMES || "09:00,14:00,20:00")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * The next wake time after `from`, as an ISO string.
 * Wraps to tomorrow's first slot when the day's windows have passed.
 */
export function nextWake(from = new Date(), times = WAKE_TIMES) {
  if (!times.length) return null;
  const candidates = times
    .map((t) => {
      const [h, m] = t.split(":").map(Number);
      const d = new Date(from);
      d.setHours(h, m || 0, 0, 0);
      return d;
    })
    .filter((d) => d > from)
    .sort((a, b) => a - b);
  if (candidates.length) return candidates[0].toISOString();
  const [h, m] = times[0].split(":").map(Number);
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  d.setHours(h, m || 0, 0, 0);
  return d.toISOString();
}

/**
 * Record what this machine is doing. Best-effort by design: a heartbeat that
 * throws would be able to fail a render, which inverts the priorities.
 */
export async function beat(state, extra = {}) {
  if (!isConfigured()) return null;
  const payload = {
    state, // "awake" | "working" | "idle"
    at: new Date().toISOString(),
    nextWake: nextWake(),
    wakeTimes: WAKE_TIMES,
    ...extra,
  };
  try {
    await putObject(KEY, JSON.stringify(payload, null, 2), { contentType: "application/json" });
    return payload;
  } catch {
    return null;
  }
}

/** Read the heartbeat. Returns null when never written — a valid first-run state. */
export async function readHeartbeat() {
  if (!isConfigured()) return null;
  try {
    const res = await fetch(presignGet(KEY, 300));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Turn raw state into the sentence a person should read.
 *
 * Deliberately concrete about time. "Your video is being made" without "started
 * 4 minutes ago, these take about 11" is the kind of progress message that makes
 * someone refresh every thirty seconds.
 */
export function describe({ heartbeat, pending = 0, running = 0, now = new Date() }) {
  /* NOT Math.max(0, ...): clamping a FUTURE timestamp to zero would read as
     "just now" and report a dead machine as awake. Clock skew between the
     laptop and a viewer's browser is normal, so a beat slightly ahead is fine,
     but one far ahead means something is wrong and should not look healthy. */
  const mins = (iso) => (iso ? Math.round((now - new Date(iso)) / 60000) : null);
  const until = (iso) => (iso ? Math.max(0, Math.round((new Date(iso) - now) / 60000)) : null);
  const human = (m) => (m == null ? "" : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`);

  const seen = heartbeat ? mins(heartbeat.at) : null;
  // A heartbeat older than 20 minutes means the machine slept without saying so
  // — a crash or a lid close mid-run. Treat it as asleep rather than trusting
  // a stale "working".
  const isAwake = heartbeat && seen != null && seen < 20 && seen > -10;

  if (isAwake && (running > 0 || heartbeat.state === "working")) {
    const job = heartbeat.current;
    const started = job?.startedAt ? human(mins(job.startedAt)) : null;
    return {
      tone: "working",
      headline: job ? `Making "${job.input}" now` : "Working on the queue now",
      detail: started ? `Started ${started} ago. These usually take about ${job?.eta || "10 min"}.` : "In progress.",
    };
  }

  if (isAwake) {
    return {
      tone: "awake",
      headline: "The laptop is awake",
      detail: pending ? `${pending} request(s) queued — they run next.` : "Nothing queued. Ask for something below.",
    };
  }

  const wait = heartbeat?.nextWake ? human(until(heartbeat.nextWake)) : null;
  const when = heartbeat?.nextWake
    ? new Date(heartbeat.nextWake).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return {
    tone: "asleep",
    headline: "The laptop is asleep",
    detail: pending
      ? `${pending} request(s) waiting.${when ? ` They run at about ${when}${wait ? ` — in ${wait}` : ""}.` : ""}`
      : `${when ? `Next run at about ${when}${wait ? ` (in ${wait})` : ""}. ` : ""}Anything you ask for now will run then.`,
  };
}
