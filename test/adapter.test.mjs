import test from "node:test";
import assert from "node:assert/strict";
import { isSupportedVersion, workbuddyAdapter } from "../src/adapter.mjs";

test("supports the verified WorkBuddy 5.9 line", () => {
  assert.equal(isSupportedVersion("5.9.1"), true);
  assert.equal(isSupportedVersion("5.9.0-beta.1"), true);
  assert.equal(isSupportedVersion("5.10.0"), false);
  assert.equal(isSupportedVersion(null), false);
});

test("matches WorkBuddy renderer targets and rejects devtools", () => {
  assert.equal(workbuddyAdapter.matchTarget({ type: "page", title: "WorkBuddy", url: "file:///app/index.html" }), true);
  assert.equal(workbuddyAdapter.matchTarget({ type: "page", title: "", url: "file:///x/app.asar/renderer/index.html" }), true);
  assert.equal(workbuddyAdapter.matchTarget({ type: "page", title: "WorkBuddy", url: "devtools://devtools/bundled/" }), false);
  assert.equal(workbuddyAdapter.matchTarget({ type: "worker", title: "WorkBuddy", url: "file:///app" }), false);
});

test("knows both current and legacy macOS bundle identifiers", () => {
  assert.deepEqual(workbuddyAdapter.platforms.darwin.bundleIds, [
    "com.tencent.workbuddy.mac",
    "com.workbuddy.workbuddy"
  ]);
});
