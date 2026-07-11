#!/usr/bin/env node
import { doctor } from "../src/doctor.js";
import { c } from "../src/colors.js";

const [, , cmd, ...rest] = process.argv;

const HELP = `
${c.bold("factory")} — content-factory command line

  ${c.cyan("factory doctor")}                       verify every tool + key the pipeline needs
  ${c.cyan("factory render <script.json>")}         compile a script into MP4 (16:9 + 9:16)
      --wide-only | --vertical-only    render a single aspect ratio
  ${c.cyan("factory help")}                         this message

  ${c.dim("arriving in later phases:")}
  ${c.dim("factory radar                  P2 — scan + score trending topics")}
  ${c.dim("factory script <trend-id>      P2 — draft a script from a trend")}
  ${c.dim("factory publish <video-id>     P5 — upload with disclosure flags")}
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
  case "help":
  case undefined:
    console.log(HELP);
    break;
  default:
    console.error(`${c.red("unknown command:")} ${cmd}`);
    console.log(HELP);
    process.exit(1);
}
