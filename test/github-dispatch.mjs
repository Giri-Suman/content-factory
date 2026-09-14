import { dispatchJob, githubConfig } from "../apps/mission-control/lib/github.js";

let passed = 0;
let failed = 0;
const check = (label, condition) => {
  condition ? passed++ : failed++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${label}`);
};

check("unconfigured cloud runner returns null", githubConfig({}) === null);

let partial = false;
try {
  githubConfig({ GITHUB_ACTIONS_TOKEN: "secret" });
} catch {
  partial = true;
}
check("partial GitHub configuration fails closed", partial);

let seen;
const env = {
  GITHUB_ACTIONS_TOKEN: "github_secret_value",
  GITHUB_REPOSITORY: "family/factory",
  GITHUB_REF: "portal-on-pages",
  GITHUB_WORKFLOW: "factory-job.yml",
};
const result = await dispatchJob(env, "m123456789ab", {
  fetchImpl: async (url, init) => {
    seen = { url, init, body: JSON.parse(init.body) };
    return new Response(null, { status: 204 });
  },
});
check("dispatch uses the selected workflow", seen.url.endsWith("/family/factory/actions/workflows/factory-job.yml/dispatches"));
check("only an opaque id is dispatched", JSON.stringify(seen.body) === JSON.stringify({ ref: "portal-on-pages", inputs: { job_id: "m123456789ab" } }));
check("successful dispatch identifies GitHub Actions", result.dispatched && result.executor === "github-actions");

let sanitized = "";
try {
  await dispatchJob(env, "m123456789ab", { fetchImpl: async () => new Response("forbidden", { status: 403 }), retries: 0 });
} catch (error) {
  sanitized = error.message;
}
check("dispatch errors do not expose the token", sanitized.includes("403") && !sanitized.includes(env.GITHUB_ACTIONS_TOKEN));

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
