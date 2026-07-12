/**
 * Telegram alert for hot trends (score >= threshold). Silently disabled
 * until TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID exist in .env.
 */
export async function sendAlert(trends) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId || trends.length === 0) return false;

  const lines = trends.map(
    (t) => `🔥 <b>${t.score}</b> — ${t.title.slice(0, 120)}\n${t.url}\n<code>factory script ${t.id}</code>`
  );
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      chat_id: chatId,
      text: `<b>Trend Radar</b>\n\n${lines.join("\n\n")}`,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  return res.ok;
}
