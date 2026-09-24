import assert from "node:assert/strict";
import { briefRequest } from "../apps/mission-control/lib/brief-request.js";
import { argvFor, CLOUD_RUNNABLE_KEYS, COMMANDS, keyOf } from "../packages/shared/src/commands.js";

const argv = ({ cmd, arg }) => argvFor(COMMANDS.find((row) => keyOf(row) === cmd), arg);

const cluster = briefRequest({ clusterId: "mug09ye1n2hvoa" });
assert.deepEqual(argv(cluster), ["brief", "mug09ye1n2hvoa"]);
assert.equal(cluster.collection, "clusters");
assert.ok(CLOUD_RUNNABLE_KEYS.has(cluster.cmd));

const wishlist = briefRequest({ wishlistId: "wish123" });
assert.deepEqual(argv(wishlist), ["brief", "wish123"]);
assert.equal(wishlist.collection, "wishlist");
assert.ok(CLOUD_RUNNABLE_KEYS.has(wishlist.cmd));

assert.deepEqual(argv(briefRequest({ topic: "new angle" })), ["brief", "topic", "new angle"]);
assert.deepEqual(argv(briefRequest({})), ["brief"]);
assert.throws(() => briefRequest({ clusterId: "../other" }), /Invalid clusterId/);
assert.throws(() => briefRequest({ clusterId: "abc", topic: "other" }), /Choose one/);
console.log("Brief routing: the selected cluster or wishlist ID reaches the CLI");
