import { encodeR2Key, presignR2Put, rfc3986 } from "../apps/mission-control/lib/r2-sign.js";

let passed = 0;
let failed = 0;
const check = (label, condition) => {
  condition ? passed++ : failed++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${label}`);
};

const credentials = {
  accountId: "0123456789abcdef",
  accessKeyId: "ACCESS123",
  secretAccessKey: "never-place-this-in-the-url",
  bucket: "family footage",
};
const options = {
  key: "footage/My clip (final).mp4",
  contentType: "video/mp4",
  expiresSec: 600,
  now: new Date("2026-09-13T12:34:56.000Z"),
};
const one = await presignR2Put(credentials, options);
const two = await presignR2Put(credentials, options);
const parsed = new URL(one.url);

check("edge presigning is deterministic", one.url === two.url);
check("R2 key segments are encoded", parsed.pathname === "/family%20footage/footage/My%20clip%20%28final%29.mp4");
check("PUT binds the expected content type", one.headers["content-type"] === "video/mp4");
check("URL expires after ten minutes", parsed.searchParams.get("X-Amz-Expires") === "600");
check("signed headers include content type", parsed.searchParams.get("X-Amz-SignedHeaders") === "content-type;host");
check("secret key never appears in browser URL", !one.url.includes(credentials.secretAccessKey));
check("signature is a lowercase sha256 hex value", /^[a-f0-9]{64}$/.test(parsed.searchParams.get("X-Amz-Signature") || ""));
check("RFC3986 helper encodes AWS special characters", rfc3986("a!b'c(d)e*f") === "a%21b%27c%28d%29e%2Af");
check("key encoder keeps separators", encodeR2Key("a b/c.mp4") === "a%20b/c.mp4");

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
