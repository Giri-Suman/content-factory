/**
 * Verify our SigV4 against AWS's PUBLISHED test vectors.
 *
 * Why this test exists: R2 rejects a bad signature with an opaque 403, and the
 * only way to tell "wrong key" from "wrong canonical request" is to check the
 * intermediate values. AWS documents an S3 presigned-GET example with the exact
 * canonical request, its hash, and the final signature — so we can prove the
 * implementation is right without any Cloudflare credentials at all.
 *
 * Vector: AWS "Signature Calculations for the Authorization Header:
 * Transferring Payload in a Single Chunk" / presigned URL example.
 *   key    AKIAIOSFODNN7EXAMPLE
 *   secret wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
 *
 * Run: node test/r2-sigv4.mjs
 */

import { createHmac } from "node:crypto";
import { signingKey, _internals } from "../packages/shared/src/r2.js";

const { sha256hex, rfc3986 } = _internals;

const SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const KEYID = "AKIAIOSFODNN7EXAMPLE";
const DATE = "20130524";
const AMZDATE = "20130524T000000Z";
const REGION = "us-east-1";
const SCOPE = `${DATE}/${REGION}/s3/aws4_request`;

let pass = 0;
let fail = 0;
const check = (label, got, want) => {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) {
    console.log(`         got  ${got}`);
    console.log(`         want ${want}`);
  }
};

/* -- 1. the canonical request AWS documents for the presigned GET --------- */
const canonicalQuery = [
  `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
  `X-Amz-Credential=${rfc3986(`${KEYID}/${SCOPE}`)}`,
  `X-Amz-Date=${AMZDATE}`,
  `X-Amz-Expires=86400`,
  `X-Amz-SignedHeaders=host`,
].join("&");

const canonicalRequest = [
  "GET",
  "/test.txt",
  canonicalQuery,
  "host:examplebucket.s3.amazonaws.com\n",
  "host",
  "UNSIGNED-PAYLOAD",
].join("\n");

// AWS publishes this hash for the above canonical request.
check("canonical request hash", sha256hex(canonicalRequest), "3bfa292879f6447bbcda7001decf97f4a54dc650c8942174ae0a9121cf58ad04");

/* -- 2. the final signature ----------------------------------------------- */
const stringToSign = ["AWS4-HMAC-SHA256", AMZDATE, SCOPE, sha256hex(canonicalRequest)].join("\n");
const sig = createHmac("sha256", signingKey(SECRET, DATE, REGION, "s3")).update(stringToSign).digest("hex");

// AWS publishes this signature. If it matches, our signing-key derivation and
// string-to-sign assembly are both correct.
check("presigned GET signature", sig, "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");

/* -- 3. the encoder AWS requires (encodeURIComponent is not enough) ------- */
check("rfc3986 encodes !'()*", rfc3986("a!b'c(d)e*f"), "a%21b%27c%28d%29e%2Af");
check("rfc3986 encodes slash", rfc3986("a/b"), "a%2Fb");
check("encodeKey preserves slash", _internals.encodeKey("renders/brief-1/short.mp4"), "renders/brief-1/short.mp4");
check("encodeKey encodes spaces", _internals.encodeKey("renders/my clip.mp4"), "renders/my%20clip.mp4");

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
