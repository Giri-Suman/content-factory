import { generateKeyPairSync, verify } from "node:crypto";
import { parseDriveReference, serviceAccountAssertion } from "../packages/cli/src/drive.js";

let passed = 0;
let failed = 0;
const check = (label, condition) => {
  condition ? passed++ : failed++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${label}`);
};

const id = "1AbCdEfGhIjKlMnOpQrStUv";
check("Drive /file/d link is parsed", parseDriveReference(`https://drive.google.com/file/d/${id}/view`).id === id);
const open = parseDriveReference(`https://drive.google.com/open?id=${id}&resourcekey=rk123`);
check("Drive open link and resource key are parsed", open.id === id && open.resourceKey === "rk123");
check("raw Drive id is accepted", parseDriveReference(id).id === id);

let foreign = false;
try {
  parseDriveReference(`https://example.com/file/d/${id}`);
} catch {
  foreign = true;
}
check("non-Google URLs are rejected", foreign);

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" });
const assertion = serviceAccountAssertion({ email: "factory@example.iam.gserviceaccount.com", privateKey: pem }, 1_800_000_000_000);
const [header, payload, signature] = assertion.split(".");
const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
check("service assertion uses RS256", JSON.parse(Buffer.from(header, "base64url").toString("utf8")).alg === "RS256");
check("service assertion requests read-only Drive scope", claims.scope === "https://www.googleapis.com/auth/drive.readonly");
check("service assertion signature verifies", verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url")));

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
