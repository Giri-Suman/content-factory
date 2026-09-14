import { generateKeyPairSync, sign } from "node:crypto";
import { accessConfig, _resetAccessCertCache, verifyAccessToken } from "../apps/mission-control/lib/access.js";

let passed = 0;
let failed = 0;
const check = (label, condition) => {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}`);
  }
};

const b64 = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = publicKey.export({ format: "jwk" });
publicJwk.kid = "family-test";
publicJwk.alg = "RS256";

const config = accessConfig({ CF_ACCESS_TEAM_DOMAIN: "family-team.cloudflareaccess.com", CF_ACCESS_AUD: "factory-aud" });
const now = Math.floor(Date.now() / 1000);
const makeToken = (claims = {}) => {
  const head = b64({ alg: "RS256", typ: "JWT", kid: publicJwk.kid });
  const body = b64({
    iss: config.issuer,
    aud: ["factory-aud"],
    email: "Family@Example.com",
    type: "app",
    iat: now,
    nbf: now - 1,
    exp: now + 300,
    ...claims,
  });
  const input = `${head}.${body}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
};
const certs = async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 });

_resetAccessCertCache();
const verified = await verifyAccessToken(makeToken(), config, { fetchImpl: certs });
check("verified Access identity is normalized", verified.email === "family@example.com");

let wrongAudience = false;
try {
  await verifyAccessToken(makeToken({ aud: "somewhere-else" }), config, { fetchImpl: certs });
} catch {
  wrongAudience = true;
}
check("wrong audience is rejected", wrongAudience);

let expired = false;
try {
  await verifyAccessToken(makeToken({ exp: now - 120 }), config, { fetchImpl: certs });
} catch {
  expired = true;
}
check("expired session is rejected", expired);

let tampered = false;
try {
  const token = makeToken();
  await verifyAccessToken(`${token.slice(0, -2)}aa`, config, { fetchImpl: certs });
} catch {
  tampered = true;
}
check("tampered signature is rejected", tampered);

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
