import assert from "node:assert/strict";
import { splitTodayBriefs } from "../apps/mission-control/lib/today-briefs.js";

const now = Date.parse("2026-09-24T01:00:00Z"); // 06:30 IST on Sep 24
const brief = (id, status, fields = {}) => ({
  id,
  status,
  checklistState: [false],
  createdAt: "2026-09-23T00:00:00Z",
  ...fields,
});

const result = splitTodayBriefs([
  brief("july", "approved", { scheduledDate: "2026-07-19" }),
  brief("today", "approved", { scheduledDate: "2026-09-24" }),
  brief("future", "approved", { scheduledDate: "2026-09-25" }),
  brief("deadline-today", "approved", { deadline: "2026-09-24T10:00:00Z" }),
  brief("deadline-passed", "approved", { deadline: "2026-09-23T23:00:00Z" }),
  brief("unscheduled", "approved"),
  brief("finished", "approved", { scheduledDate: "2026-09-24", checklistState: [true] }),
  brief("old-draft", "draft", { deadline: "2026-07-20T00:00:00Z" }),
  brief("old-unscheduled-draft", "draft", { createdAt: "2026-08-01T00:00:00Z" }),
  brief("new-draft", "draft"),
], now);

assert.deepEqual(result.toPost.map((b) => b.id), ["today", "deadline-today", "unscheduled"]);
assert.deepEqual(result.awaiting.map((b) => b.id), ["new-draft"]);
assert.equal(result.overdueApprovedCount, 2);
assert.equal(result.upcomingApprovedCount, 1);
assert.equal(result.staleDraftCount, 2);
console.log("Today briefs: old slots stay in backlog; today's work stays visible");
