/** Record a GitHub Actions setup failure in the same R2 job the portal polls. */

import { claim, fail, findJob } from "../packages/shared/src/queue.js";

const id = String(process.env.FACTORY_JOB_ID || "").trim();
if (!/^[a-z0-9]{8,40}$/i.test(id)) throw new Error("FACTORY_JOB_ID is invalid");

let job = await findJob(id, "running");
if (!job) {
  const pending = await findJob(id, "pending");
  if (pending) job = await claim(pending);
}

if (job) {
  const runUrl = `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${process.env.GITHUB_REPOSITORY || ""}/actions/runs/${process.env.GITHUB_RUN_ID || ""}`;
  await fail(job, `GitHub Actions could not prepare the cloud runner. Open ${runUrl} for the setup log.`);
  console.log(`recorded setup failure for ${id}`);
} else {
  console.log(`${id} already has a terminal outcome; nothing to change`);
}
