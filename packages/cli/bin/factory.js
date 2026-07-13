#!/usr/bin/env node
import { doctor } from "../src/doctor.js";
import { c } from "../src/colors.js";

const [, , cmd, ...rest] = process.argv;

const HELP = `
${c.bold("factory")} — content-factory command line

  ${c.cyan("factory doctor")}                       verify every tool + key the pipeline needs
  ${c.cyan("factory render <script.json>")}         compile a script into MP4 (16:9 + 9:16)
      --wide-only | --vertical-only    render a single aspect ratio
  ${c.cyan("factory radar")}                        scan + score trending topics, alert hot ones
  ${c.cyan("factory script <id | \"topic\">")}        draft a script.json from a trend or topic
      --template                       skeleton to hand-fill (no API key needed)
  ${c.cyan("factory math \"<topic>\"")}               LLM-written manim math short (9:16)
      factory math <demo-name> --demo  render a bundled demo (no key needed)
  ${c.cyan("factory shorts <id>")}                  cut 1-3 standalone clips from a rendered episode
  ${c.cyan("factory edit <footage.mp4>")}           auto-edit filmed footage: silence cuts + punch-ins
      --noise=-35dB --min-silence=0.45 --no-punch --no-captions
  ${c.cyan("factory publish <id>")}                 compliance-check + upload to YouTube (dry-run without --go)
      --public | --unlisted            visibility (default: private) · --at "<iso>" schedules · --go = real upload
  ${c.cyan("factory auth-youtube")}                 one-time OAuth to get your refresh token
  ${c.cyan("factory analytics")}                    pull stats -> category weights that steer the radar
  ${c.cyan("factory help")}                         this message
`;

switch (cmd) {
  case "doctor": {
    const ok = await doctor();
    process.exit(ok ? 0 : 1);
    break;
  }
  case "render": {
    const { renderScript } = await import("../../pipeline/src/render.js");
    const ok = await renderScript(rest);
    process.exit(ok ? 0 : 1);
    break;
  }
  case "radar": {
    const { runRadar } = await import("../../radar/src/radar.js");
    const ok = await runRadar(rest);
    process.exit(ok ? 0 : 1);
    break;
  }
  case "script": {
    const { generateScript } = await import("../../studio/src/generate.js");
    const ok = await generateScript(rest);
    process.exit(ok ? 0 : 1);
    break;
  }
  case "math": {
    const { mathShort } = await import("../../pipeline/src/math.js");
    const ok = await mathShort(rest);
    process.exit(ok ? 0 : 1);
    break;
  }
  case "shorts": {
    const { makeClips } = await import("../../pipeline/src/clips.js");
    const ok = await makeClips(rest);
    process.exit(ok ? 0 : 1);
    break;
  }
  case "edit": {
    const { autoEdit } = await import("../../pipeline/src/autoedit.js");
    const ok = await autoEdit(rest);
    process.exit(ok ? 0 : 1);
    break;
  }
  case "publish": {
    const { publish } = await import("../../publish/src/publish.js");
    const ok = await publish(rest);
    process.exit(ok ? 0 : 1);
    break;
  }
  case "auth-youtube": {
    const { authYoutube } = await import("../../publish/src/auth.js");
    const ok = await authYoutube();
    process.exit(ok ? 0 : 1);
    break;
  }
  case "analytics": {
    const { runAnalytics } = await import("../../publish/src/analytics.js");
    const ok = await runAnalytics();
    process.exit(ok ? 0 : 1);
    break;
  }
  case "compliance": {
    // machine-readable compliance report for the portal
    const { checkCompliance } = await import("../../publish/src/compliance.js");
    const { loadEnv } = await import("../../shared/src/config.js");
    loadEnv();
    const id = rest.filter((a) => !a.startsWith("--"))[0];
    if (!id) {
      console.error("usage: factory compliance <id> [--json]");
      process.exit(1);
    }
    const report = checkCompliance(id, { platform: "youtube" });
    if (rest.includes("--json")) console.log(`RESULT ${JSON.stringify(report)}`);
    else {
      const icon = { ok: "+", warn: "o", fail: "x" };
      for (const ch of report.checks) console.log(`  ${icon[ch.level]} ${ch.msg}`);
      console.log(report.pass ? "\nPASS" : "\nBLOCKED");
    }
    process.exit(0);
    break;
  }
  case "help":
  case undefined:
    console.log(HELP);
    break;
  default:
    console.error(`${c.red("unknown command:")} ${cmd}`);
    console.log(HELP);
    process.exit(1);
}
