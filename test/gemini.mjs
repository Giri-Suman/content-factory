/**
 * The Gemini provider's wire format, checked without a key.
 *
 * Run: node test/gemini.mjs
 *
 * AI Studio is NOT OpenAI-shaped - the system prompt is `systemInstruction`
 * rather than a message, the key goes in a header not a bearer token, and the
 * answer is nested under candidates/content/parts. Every one of those is easy
 * to get subtly wrong in a way that only shows up as an empty reply against a
 * real key, so this pins the request and response handling with a stubbed
 * fetch.
 */
import { loadEnv } from "../packages/shared/src/config.js";

let pass = 0;
let fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " — " + detail : ""}`);
  }
};

loadEnv();
process.env.GEMINI_API_KEY = "test-key";
process.env.LLM_PROVIDER = "google";
process.env.GEMINI_MODEL = "gemini-test-model";

const realFetch = globalThis.fetch;
let seen = null;

const stub = (body, status = 200) => {
  globalThis.fetch = async (url, init) => {
    seen = { url: String(url), init };
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
};

const { chat, resolveProvider, modelFor } = await import("../packages/llm/src/llm.js");

ok("a Gemini key alone selects the google provider", resolveProvider() === "google");
ok("the model id carries no vendor prefix", !String(modelFor("script", "google")).includes("/"));

/* ------------------------------------------------------------ request --- */
stub({ candidates: [{ content: { parts: [{ text: "hello from gemini" }] } }] });
const res = await chat({ system: "SYS", user: "USR", task: "score", maxTokens: 128, tier: "free" });

ok("returns the model's text", res.text === "hello from gemini", JSON.stringify(res));
ok("attributes the answer to the google provider", res.provider === "google" && res.model === "gemini-test-model", JSON.stringify(res));
ok("calls the generateContent endpoint", /generativelanguage\.googleapis\.com.*:generateContent/.test(seen.url), seen.url);
ok("sends the key as a header, never in the URL", !seen.url.includes("test-key") && seen.init.headers["x-goog-api-key"] === "test-key");

const body = JSON.parse(seen.init.body);
ok("system prompt goes in systemInstruction", body.systemInstruction?.parts?.[0]?.text === "SYS", JSON.stringify(body.systemInstruction));
ok("user prompt goes in contents", body.contents?.[0]?.parts?.[0]?.text === "USR");
ok("token cap uses maxOutputTokens", body.generationConfig?.maxOutputTokens === 128, JSON.stringify(body.generationConfig));

/* ----------------------------------------------------------- failures --- */
stub({ error: { message: "model not found" } }, 404);
let err = null;
try {
  await chat({ system: "s", user: "u", task: "score", maxTokens: 16, tier: "free" });
} catch (e) {
  err = e;
}
ok("a 404 names the command that lists valid ids", err && /factory ai gemini/.test(err.message), err?.message.slice(0, 120));

// A safety refusal is a decision, not an outage - it must not read as a blank.
stub({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] });
err = null;
try {
  await chat({ system: "s", user: "u", task: "score", maxTokens: 16, tier: "free" });
} catch (e) {
  err = e;
}
ok("an empty answer reports its finishReason", err && /SAFETY/.test(err.message), err?.message.slice(0, 120));

globalThis.fetch = realFetch;
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
