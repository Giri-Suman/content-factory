/** Keep historical briefs in the backlog instead of presenting them as today's work. */
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const istDay = (timestamp) => new Date(timestamp + IST_OFFSET_MS).toISOString().slice(0, 10);

export function splitTodayBriefs(briefs, now = Date.now()) {
  const today = istDay(now);
  const toPost = [];
  const awaiting = [];
  let overdueApprovedCount = 0;
  let upcomingApprovedCount = 0;
  let staleDraftCount = 0;

  for (const brief of briefs) {
    const deadlineTime = Date.parse(brief.deadline || "");
    const hasDeadline = Number.isFinite(deadlineTime);
    const scheduledDay = /^\d{4}-\d{2}-\d{2}$/.test(brief.scheduledDate || "") ? brief.scheduledDate : null;
    const dueDay = scheduledDay || (hasDeadline ? istDay(deadlineTime) : null);
    const overdue = scheduledDay ? scheduledDay < today : hasDeadline && deadlineTime < now;

    if (brief.status === "approved" && (brief.checklistState || []).some((step) => !step)) {
      if (overdue) overdueApprovedCount++;
      else if (dueDay && dueDay > today) upcomingApprovedCount++;
      else toPost.push(brief);
    }

    if (brief.status === "draft") {
      const createdTime = Date.parse(brief.createdAt || "");
      const oldUnscheduled = !dueDay && Number.isFinite(createdTime) && now - createdTime > 14 * DAY_MS;
      if (overdue || oldUnscheduled) staleDraftCount++;
      else awaiting.push(brief);
    }
  }

  awaiting.sort((a, b) => (a.deadline || a.scheduledDate || "z").localeCompare(b.deadline || b.scheduledDate || "z"));
  return { toPost, awaiting, overdueApprovedCount, upcomingApprovedCount, staleDraftCount };
}
