import assert from "node:assert/strict";
import { jobOutputTail } from "../packages/cli/src/queue.js";

const result = { out: "D:\\youtube\\automated website\\content-factory\\renders\\math-gauss-sum\\short.mp4", id: "math-gauss-sum", title: "Add 1 to 100 instantly" };
const log = [...Array.from({ length: 4 }, () => `Encoded 1245/1294 ${"x".repeat(100)}`), "cloud -> renders/math-gauss-sum/short.mp4", `RESULT ${JSON.stringify(result)}`].join("\n");
const oldTail = jobOutputTail(log);
assert.doesNotMatch(oldTail, /RESULT /); // progress can consume the entire 400-character tail
const success = jobOutputTail(log, { success: true });
assert.deepEqual(JSON.parse(success.slice(7)), result);
assert.match(success, /"id":"math-gauss-sum"/);
console.log("Queue result: complete structured result survives progress log truncation");
