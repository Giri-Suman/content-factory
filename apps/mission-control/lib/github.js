/**
 * Dispatch one opaque queue id to GitHub Actions from the Cloudflare Edge.
 *
 * The workflow receives no command or user-controlled shell text. It fetches
 * the queue record from R2 and rebuilds argv from the checked-in registry.
 */

const clean = (value) => String(value || "").trim();

export function githubConfig(env = {}) {
  const token = clean(env.GITHUB_ACTIONS_TOKEN);
  const repository = clean(env.GITHUB_REPOSITORY);
  const ref = clean(env.GITHUB_REF);
  const workflow = clean(env.GITHUB_WORKFLOW) || "factory-job.yml";

  if (!token && !repository && !ref) return null;
  const missing = [
    ["GITHUB_ACTIONS_TOKEN", token],
    ["GITHUB_REPOSITORY", repository],
    ["GITHUB_REF", ref],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`GitHub cloud runner is partly configured; missing ${missing.join(", ")}`);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("GITHUB_REPOSITORY must look like owner/repository");
  }
  if (!/^[A-Za-z0-9_./-]+$/.test(ref) || ref.includes("..")) throw new Error("GITHUB_REF is invalid");
  if (!/^[A-Za-z0-9_.-]+\.ya?ml$/.test(workflow)) throw new Error("GITHUB_WORKFLOW is invalid");
  return { token, repository, ref, workflow };
}

const retryable = (status) => status === 429 || status >= 500;

export async function dispatchJob(env, jobId, { fetchImpl = fetch, retries = 2 } = {}) {
  const config = githubConfig(env);
  if (!config) return { configured: false, executor: "laptop" };
  const id = clean(jobId);
  if (!/^[a-z0-9]{8,40}$/i.test(id)) throw new Error("invalid cloud job id");

  const endpoint = `https://api.github.com/repos/${config.repository}/actions/workflows/${config.workflow}/dispatches`;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${config.token}`,
          "content-type": "application/json",
          "user-agent": "content-factory-portal",
          "x-github-api-version": "2022-11-28",
        },
        body: JSON.stringify({ ref: config.ref, inputs: { job_id: id } }),
      });
      if (response.status === 204) {
        return { configured: true, dispatched: true, executor: "github-actions", workflow: config.workflow };
      }
      const detail = (await response.text()).slice(0, 240).replace(/\s+/g, " ").trim();
      lastError = new Error(`GitHub Actions dispatch failed (${response.status})${detail ? `: ${detail}` : ""}`);
      if (!retryable(response.status) || attempt === retries) break;
    } catch (error) {
      lastError = new Error(`GitHub Actions dispatch failed: ${error?.message || "network error"}`);
      if (attempt === retries) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw lastError || new Error("GitHub Actions dispatch failed");
}
