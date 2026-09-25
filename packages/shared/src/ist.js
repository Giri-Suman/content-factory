/** Calendar date used by the family portal and scheduled jobs. */
export const istDay = (timestamp = Date.now()) =>
  new Date(timestamp + 330 * 60 * 1000).toISOString().slice(0, 10);
