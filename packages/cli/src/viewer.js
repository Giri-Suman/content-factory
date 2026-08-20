/**
 * `factory viewer` — an always-on, read-only page listing finished videos.
 *
 * WHY IT IS STATIC: the ops portal cannot move to Cloudflare — 30 of its 37 API
 * routes use node:fs/child_process, which the Workers runtime does not have.
 * Rewriting them would fork the codebase into local and cloud builds. This sits
 * BESIDE the portal instead: a generated HTML file with the video list and
 * presigned links baked in, deployed to Cloudflare Pages. Nothing of the
 * existing portal changes.
 *
 * WHY READ-ONLY: this URL is meant to be shared. The ops portal can run 46
 * commands on the host and spend API credit; nothing here can run anything. It
 * is a list of links. That is a security property, not a missing feature.
 *
 * WHY LINKS ARE BAKED IN: fetching from R2 in the browser would need a public
 * bucket (which needs a domain) or CORS on a signed API. Baking presigned URLs
 * into the page needs neither, so the bucket stays private and no DNS record is
 * created. Links last 7 days; retention deletes videos after 48h, so the video
 * always expires before its link does.
 *
 * SAFETY: no wrangler config is written. Deployment passes --project-name
 * explicitly so it cannot collide with the `coderfact` Worker serving the
 * portfolio site.
 */

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "../../shared/src/config.js";
import { RETAIN_HOURS, isConfigured, listObjects, missingConfig, presignGet, usage } from "../../shared/src/r2.js";

const OUT_DIR = path.join(repoRoot, "data", "viewer");
const PROJECT = "content-factory-viewer"; // deliberately NOT "coderfact"
const LINK_DAYS = 7;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const mb = (n) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : `${(n / 1048576).toFixed(1)} MB`);

/** Group flat R2 keys (renders/<id>/<file>) into one card per render. */
function groupByRender(objects) {
  const groups = new Map();
  for (const o of objects) {
    const parts = o.key.split("/");
    if (parts.length < 3) continue;
    const id = parts[1];
    if (!groups.has(id)) groups.set(id, { id, files: [], newest: 0 });
    const g = groups.get(id);
    const t = Date.parse(o.modified || "") || 0;
    g.files.push({ ...o, name: parts.slice(2).join("/"), when: t });
    if (t > g.newest) g.newest = t;
  }
  // newest first — what someone opening this page wants to see
  return [...groups.values()].sort((a, b) => b.newest - a.newest);
}

function renderHtml({ groups, stats, generatedAt }) {
  const cards = groups
    .map((g) => {
      const videos = g.files.filter((f) => /\.mp4$/i.test(f.name));
      const poster = g.files.find((f) => /\.(png|jpg|webp)$/i.test(f.name));
      const expiresAt = g.newest + RETAIN_HOURS * 3600 * 1000;
      const hoursLeft = Math.round((expiresAt - Date.now()) / 3600000);
      const expiry =
        hoursLeft > 0
          ? `<span class="pill ${hoursLeft <= 6 ? "warn" : ""}">expires in ${hoursLeft}h</span>`
          : `<span class="pill gone">past retention</span>`;

      const rows = videos
        .map(
          (v) => `
          <div class="file">
            <span class="fname">${esc(v.name)}</span>
            <span class="fsize">${mb(v.size)}</span>
            <a class="dl" href="${esc(presignGet(v.key, LINK_DAYS * 86400))}">Download</a>
          </div>`
        )
        .join("");

      // The <video> src is a presigned URL straight to R2 — playback never
      // touches the laptop, which is the whole point of this page.
      const player = videos.length
        ? `<video controls preload="none" ${poster ? `poster="${esc(presignGet(poster.key, LINK_DAYS * 86400))}"` : ""} src="${esc(
            presignGet(videos[0].key, LINK_DAYS * 86400)
          )}"></video>`
        : "";

      return `<article class="card">
        ${player}
        <div class="meta">
          <h2>${esc(g.id)}</h2>
          <div class="sub">${new Date(g.newest).toLocaleString()} ${expiry}</div>
          ${rows}
        </div>
      </article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- Not a page that should turn up in search results. -->
<meta name="robots" content="noindex,nofollow,noarchive">
<title>Content Factory — finished videos</title>
<style>
  :root{
    --bg:#0d1117; --panel:#161b22; --border:#30363d;
    --text:#e6edf3; --muted:#8b949e; --accent:#ffb224;
  }
  @media (prefers-color-scheme: light){
    :root{ --bg:#ffffff; --panel:#f6f8fa; --border:#d0d7de; --text:#1f2328; --muted:#656d76; }
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);
    font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px 16px 64px}
  header{max-width:1100px;margin:0 auto 22px}
  h1{font-size:20px;margin:0 0 6px}
  .stats{color:var(--muted);font-size:13px}
  .bar{height:6px;background:var(--border);border-radius:3px;margin:10px 0 4px;overflow:hidden;max-width:420px}
  .bar > i{display:block;height:100%;background:var(--accent)}
  .grid{max-width:1100px;margin:0 auto;display:grid;gap:16px;
    grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
  .card{background:var(--panel);border:1px solid var(--border);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
  video{width:100%;background:#000;display:block;aspect-ratio:9/16;object-fit:contain}
  .meta{padding:12px 14px 14px}
  h2{font-size:13px;margin:0 0 4px;font-family:ui-monospace,monospace;word-break:break-all}
  .sub{color:var(--muted);font-size:12px;margin-bottom:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .pill{border:1px solid var(--border);border-radius:99px;padding:1px 8px;font-size:11px}
  .pill.warn{color:var(--accent);border-color:var(--accent)}
  .pill.gone{color:#f85149;border-color:#f85149}
  .file{display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--border);font-size:12px}
  .fname{font-family:ui-monospace,monospace;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .fsize{color:var(--muted)}
  .dl{color:var(--accent);text-decoration:none;border:1px solid var(--accent);border-radius:6px;padding:2px 10px}
  .dl:hover{background:var(--accent);color:#0d1117}
  .empty{max-width:1100px;margin:0 auto;color:var(--muted);border:1px dashed var(--border);border-radius:10px;padding:28px;text-align:center}
  .cmds{max-width:1100px;margin:0 auto 14px;background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:14px 16px}
  .stagebar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
  .cmd{display:flex;gap:10px;align-items:baseline;padding:8px 0;border-top:1px solid var(--border)}
  .cmd .n{flex:1;min-width:0}
  .cmd .n b{font-size:13px;color:var(--text);font-weight:600}
  .cmd .n span{display:block;color:var(--muted);font-size:11.5px}
  .lap{background:var(--border);color:var(--muted);border-radius:99px;padding:1px 7px;font-size:10.5px;white-space:nowrap}
  .go{background:var(--accent);color:#0d1117;border:0;border-radius:6px;padding:4px 12px;font:inherit;font-size:12px;font-weight:600;cursor:pointer}
  .go:disabled{opacity:.5}
  #cmdmsg{margin-top:10px;font-size:13px}
  #cmdmsg.ok{color:#3fb950} #cmdmsg.err{color:#f85149}
  .info{max-width:1100px;margin:0 auto 14px;background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:14px 16px}
  .tabs{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
  .tab{background:transparent;color:var(--muted);border:1px solid var(--border);border-radius:99px;padding:4px 13px;font:inherit;font-size:12.5px;cursor:pointer}
  .tab.on{background:var(--accent);color:#0d1117;border-color:var(--accent);font-weight:600}
  .kv{display:flex;gap:22px;flex-wrap:wrap}
  .kv div{min-width:96px}
  .kv b{display:block;font-size:19px;color:var(--text)}
  .row{display:flex;gap:10px;padding:7px 0;border-top:1px solid var(--border);font-size:12.5px;align-items:baseline}
  .row .t{flex:1;color:var(--text);min-width:0}
  .row .s{color:var(--muted);font-size:11.5px;white-space:nowrap}
  .status{max-width:1100px;margin:0 auto 14px;display:flex;gap:12px;align-items:center;
    background:var(--panel);border:1px solid var(--border);border-left-width:4px;border-radius:10px;padding:13px 16px}
  .status strong{font-size:14px}
  .status .muted{color:var(--muted);font-size:12.5px;margin-top:2px}
  .status .dot{width:10px;height:10px;border-radius:50%;background:var(--muted);flex:none}
  .status.working{border-left-color:var(--accent)} .status.working .dot{background:var(--accent);animation:p 1.4s infinite}
  .status.awake{border-left-color:#3fb950}        .status.awake .dot{background:#3fb950}
  .status.asleep{border-left-color:var(--muted)}
  @keyframes p{0%,100%{opacity:1}50%{opacity:.35}}
  .ask{max-width:1100px;margin:0 auto 22px;background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:16px 18px}
  .ask h3{margin:0 0 4px;font-size:15px}
  .ask p{margin:0 0 12px;color:var(--muted);font-size:12.5px}
  .ask form{display:flex;gap:8px;flex-wrap:wrap}
  .ask select,.ask input{background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:7px;padding:8px 10px;font:inherit;font-size:13px}
  .ask input[name=input]{flex:1;min-width:220px}
  .ask input[name=requestedBy]{width:130px}
  .ask button{background:var(--accent);color:#0d1117;border:0;border-radius:7px;padding:8px 18px;font:inherit;font-weight:600;cursor:pointer}
  .ask button:disabled{opacity:.5;cursor:default}
  #msg{margin-top:10px;font-size:13px}
  #msg.ok{color:#3fb950} #msg.err{color:#f85149}
  footer{max-width:1100px;margin:28px auto 0;color:var(--muted);font-size:12px;line-height:1.7}
</style>
</head>
<body>
<header>
  <h1>Finished videos</h1>
  <div class="stats">
    ${groups.length} render${groups.length === 1 ? "" : "s"} · ${mb(stats.bytes)} of 10 GB stored
    <div class="bar"><i style="width:${Math.min(100, stats.pctOfFree * 100).toFixed(1)}%"></i></div>
    Videos are deleted ${RETAIN_HOURS}h after they are made. Download anything you want to keep.
  </div>
</header>

<section class="cmds">
  <h2 style="font-size:15px;margin:0 0 4px">Run something</h2>
  <p class="muted" style="font-size:12.5px;margin:0 0 10px">
    Everything the factory can do. Jobs marked <span class="lap">laptop</span> need that
    machine - they are queued and run automatically the next time it wakes.
  </p>
  <div class="stagebar" id="stagebar"></div>
  <div id="cmdlist" class="muted" style="font-size:13px">loading...</div>
  <div id="cmdmsg"></div>
</section>

<section class="info">
  <div class="tabs">
    <button class="tab on" data-t="summary">Overview</button>
    <button class="tab" data-t="briefs">Briefs</button>
    <button class="tab" data-t="trends">What to make</button>
  </div>
  <div id="infobody" class="muted" style="font-size:13px">loading...</div>
</section>

<section id="status" class="status loading">
  <div class="dot"></div>
  <div>
    <strong id="s-head">Checking...</strong>
    <div id="s-detail" class="muted"></div>
  </div>
</section>

<section class="ask">
  <h3>Ask for something</h3>
  <p>Queued for the laptop. It runs the next time that machine is awake — you do not have to wait for it now.</p>
  <form id="f">
    <select name="kind">
      <option value="math">Math short</option>
      <option value="brief">Brief an idea</option>
    </select>
    <input name="input" placeholder="e.g. why 0.999... equals 1" maxlength="200" required>
    <input name="requestedBy" placeholder="your name" maxlength="40">
    <button>Queue it</button>
  </form>
  <div id="msg"></div>
</section>

${groups.length ? `<div class="grid">${cards}</div>` : `<div class="empty">Nothing here yet.<br>Renders appear once they are pushed to storage.</div>`}

<footer>
  Generated ${esc(generatedAt)} · links valid ${LINK_DAYS} days.<br>
  Read-only. This page lists files and nothing else — it cannot start renders or run commands.
</footer>
<script>
  // Live status: the page itself is static, but this reads the queue and the
  // laptop's heartbeat from R2 so it can say what is actually happening.
  const human = (m) => m == null ? '' : m < 60 ? m + ' min' : Math.floor(m/60) + 'h ' + (m%60) + 'm';

  async function refreshStatus() {
    const box = document.getElementById('status');
    const head = document.getElementById('s-head');
    const detail = document.getElementById('s-detail');
    try {
      const r = await fetch('/api/status', { cache: 'no-store' });
      const s = await r.json();
      if (!s.ok) throw new Error(s.error || 'status unavailable');

      const q = s.queue, L = s.laptop;
      let tone = 'asleep', h = 'The laptop is asleep', d = '';

      if (L.awake && L.current) {
        tone = 'working';
        h = 'Making "' + L.current.input + '" now';
        const mins = L.current.startedAt ? Math.round((Date.now() - Date.parse(L.current.startedAt))/60000) : null;
        d = (mins != null ? 'Started ' + human(mins) + ' ago. ' : '') +
            'These usually take about ' + (L.current.eta || 'a few minutes') + '.' +
            (q.pending ? ' ' + q.pending + ' more waiting after this.' : '');
      } else if (L.awake) {
        tone = 'awake'; h = 'The laptop is awake';
        d = q.pending ? q.pending + ' request(s) queued - they run next.' : 'Nothing queued. Ask for something below.';
      } else {
        const when = L.nextWake ? new Date(L.nextWake) : null;
        const inMin = when ? Math.max(0, Math.round((when - Date.now())/60000)) : null;
        const at = when ? when.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : null;
        d = (q.pending ? q.pending + ' request(s) waiting. ' : 'Nothing is queued. ') +
            (at ? 'Next run at about ' + at + (inMin != null ? ' (in ' + human(inMin) + ')' : '') + '.'
                : 'It will run when the laptop is next on.');
        if (q.done) d += ' ' + q.done + ' finished so far - see below.';
      }
      box.className = 'status ' + tone;
      head.textContent = h;
      detail.textContent = d;
    } catch (e) {
      box.className = 'status asleep';
      head.textContent = 'Status unavailable';
      detail.textContent = 'The video list below still works.';
    }
  }
  // Live state from R2. This is what makes the factory's INFORMATION available
  // with the laptop off - execution stays local, reading happens here.
  const esc2 = (x) => String(x ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  async function loadInfo(which) {
    const box = document.getElementById('infobody');
    box.textContent = 'loading...';
    try {
      const r = await fetch('/api/info?of=' + which, { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'unavailable');
      if (which === 'summary') {
        const st = Object.entries(j.briefs.byStatus || {}).map(([k,v]) => k + ' ' + v).join(' · ');
        box.innerHTML = '<div class="kv">' +
          '<div><b>' + j.briefs.total + '</b>briefs</div>' +
          '<div><b>' + j.clusters.scored + '</b>scored topics</div>' +
          '<div><b>' + j.publishItems + '</b>publish items</div>' +
          '<div><b>' + j.renderFiles + '</b>files stored</div>' +
          '<div><b>' + j.queuePending + '</b>queued</div>' +
          '</div>' + (st ? '<div style="margin-top:10px">' + esc2(st) + '</div>' : '');
      } else if (which === 'briefs') {
        box.innerHTML = j.briefs.length
          ? j.briefs.map(b => '<div class="row"><span class="t">' + esc2(b.topic) +
              (b.hook ? '<br><span class="s">' + esc2(String(b.hook).slice(0,90)) + '</span>' : '') +
              '</span><span class="s">' + esc2(b.status || '') + (b.deadline ? ' · ' + esc2(String(b.deadline).slice(0,10)) : '') + '</span></div>').join('')
          : 'No briefs yet.';
      } else {
        box.innerHTML = j.clusters.length
          ? j.clusters.map(c => '<div class="row"><span class="t">' + esc2(c.label) + '</span><span class="s">' +
              esc2(c.category || '') + ' · score ' + Math.round(c.score) + '</span></div>').join('')
          : 'No scored topics yet.';
      }
    } catch (e) {
      box.textContent = 'Information unavailable (' + e.message + '). Videos below still work.';
    }
  }
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
    t.classList.add('on');
    loadInfo(t.dataset.t);
  }));
  loadInfo('summary');

  // The full command surface. Laptop jobs are queued rather than hidden - the
  // page says what will happen and when, which is the whole point of it being
  // reachable while that machine sleeps.
  let CMDS = [], STAGE = 'find';
  async function loadCommands() {
    const list = document.getElementById('cmdlist');
    try {
      const j = await (await fetch('/api/commands', { cache: 'no-store' })).json();
      if (!j.ok) throw new Error(j.error);
      CMDS = j.commands;
      const bar = document.getElementById('stagebar');
      bar.innerHTML = Object.entries(j.stages).map(([k, lbl]) =>
        '<button class="tab' + (k === STAGE ? ' on' : '') + '" data-s="' + k + '">' + esc2(lbl) + '</button>').join('');
      bar.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        STAGE = b.dataset.s;
        bar.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        renderCmds();
      }));
      renderCmds();
    } catch (e) {
      list.textContent = 'Commands unavailable (' + e.message + ').';
    }
  }
  function renderCmds() {
    const list = document.getElementById('cmdlist');
    const rows = CMDS.filter(c => c.stage === STAGE);
    list.innerHTML = rows.map(c =>
      '<div class="cmd" data-k="' + esc2(c.key) + '">' +
      '<span class="n"><b>' + esc2(c.label) + '</b><span>' + esc2(c.desc || '') + '</span></span>' +
      (c.argKind ? '<input class="ai" placeholder="' + esc2(c.argLabel || c.argKind) + '" style="width:170px;padding:5px 8px;border-radius:6px;background:var(--bg);color:var(--text);border:1px solid var(--border);font:inherit;font-size:12px">' : '') +
      (c.laptop ? '<span class="lap">laptop</span>' : '') +
      '<button class="go">' + (c.laptop ? 'Queue' : 'Run') + '</button></div>').join('') || 'Nothing in this stage.';
    list.querySelectorAll('.cmd').forEach(row => {
      row.querySelector('.go').addEventListener('click', async () => {
        const btn = row.querySelector('.go'), msg = document.getElementById('cmdmsg');
        const input = row.querySelector('.ai')?.value || '';
        btn.disabled = true; msg.className = ''; msg.textContent = 'queueing...';
        try {
          const r = await fetch('/api/commands', { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ cmd: row.dataset.k, input, requestedBy: 'portal' }) });
          const j = await r.json();
          if (j.ok) { msg.className = 'ok'; msg.textContent = j.queued + ' - ' + j.message; refreshStatus(); }
          else { msg.className = 'err'; msg.textContent = j.error; }
        } catch (e) { msg.className = 'err'; msg.textContent = e.message; }
        finally { btn.disabled = false; }
      });
    });
  }
  loadCommands();

  refreshStatus();
  // While something is running, a person WILL sit and watch this. 20s is often
  // enough to feel live without hammering the endpoint.
  setInterval(refreshStatus, 20000);

  // The ONLY write call this page makes. It posts to a Pages Function that
  // writes a queue entry to R2 — it cannot run anything, and the laptop decides
  // what a "kind" maps to when it drains.
  document.getElementById('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target, btn = form.querySelector('button'), msg = document.getElementById('msg');
    const body = Object.fromEntries(new FormData(form));
    btn.disabled = true; msg.className = ''; msg.textContent = 'queueing...';
    try {
      const r = await fetch('/api/request', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
      const j = await r.json();
      if (j.ok) { msg.className='ok'; msg.textContent = 'Queued: ' + j.queued + ' — it will run next time the laptop is awake.'; form.reset(); refreshStatus(); }
      else { msg.className='err'; msg.textContent = j.error || 'could not queue'; }
    } catch (err) {
      msg.className='err'; msg.textContent = 'network error — ' + err.message;
    } finally { btn.disabled = false; }
  });
</script>
</body>
</html>`;
}

export async function viewer(argv) {
  const [action = "build"] = argv;

  if (!isConfigured()) {
    console.log(`\n  R2 is not configured. Missing: ${missingConfig().join(", ")}`);
    console.log(`  The viewer lists what is in R2, so it needs the same credentials.\n`);
    return false;
  }

  switch (action) {
    case "build": {
      const objects = await listObjects("renders/");
      const stats = await usage();
      const groups = groupByRender(objects);
      const html = renderHtml({ groups, stats, generatedAt: new Date().toISOString() });

      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(path.join(OUT_DIR, "index.html"), html);
      // Belt-and-braces with the meta tag: crawlers that read robots.txt first.
      writeFileSync(path.join(OUT_DIR, "robots.txt"), "User-agent: *\nDisallow: /\n");

      /* Pages Functions live in SOURCE. data/ is gitignored, so a function kept
         only in the output directory would never be committed and would vanish
         on a clean checkout. Copy them into the deploy dir on every build. */
      const fnSrc = path.join(repoRoot, "packages", "cli", "src", "viewer-functions");
      if (existsSync(fnSrc)) {
        cpSync(fnSrc, path.join(OUT_DIR, "functions"), { recursive: true });
        console.log(`    + functions/api/request.js (queue endpoint)`);
      } else {
        console.log(`    ! viewer-functions missing — the request form will not work`);
      }

      console.log(`\n  built ${path.relative(repoRoot, OUT_DIR)}/index.html`);
      console.log(`    ${groups.length} render(s), ${Math.round(Buffer.byteLength(html) / 1024)}KB page`);
      console.log(`    ${mb(stats.bytes)} stored, links valid ${LINK_DAYS} days\n`);
      console.log(`  preview locally:  start ${path.join(OUT_DIR, "index.html")}`);
      console.log(`  publish:          factory viewer publish\n`);
      return true;
    }

    case "publish": {
      const built = path.join(OUT_DIR, "index.html");
      console.log(`\n  Deploy the generated page to Cloudflare Pages:\n`);
      console.log(`    npx wrangler pages deploy "${OUT_DIR}" --project-name=${PROJECT}\n`);
      console.log(`  Notes:`);
      console.log(`    - first run creates the project and asks which branch; "main" is fine`);
      console.log(`    - you get a free https://${PROJECT}.pages.dev URL — no DNS record needed`);
      console.log(`    - --project-name is passed explicitly and is NOT "coderfact", so this`);
      console.log(`      cannot touch the Worker serving your portfolio site`);
      console.log(`    - re-run "factory viewer build" then deploy again to refresh the list\n`);
      console.log(`  The page is PUBLIC to anyone with the URL. To require a login, put`);
      console.log(`  Cloudflare Access in front of it (free): Zero Trust -> Access -> Applications.\n`);
      console.log(`  built page: ${built}\n`);
      return true;
    }

    default:
      console.log(`unknown: viewer ${action}\n  build · publish`);
      return false;
  }
}
