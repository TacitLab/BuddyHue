import test from "node:test";
import assert from "node:assert/strict";
import {
  OFFICIAL_GIT_SPEC,
  checkForUpdate,
  compareVersions,
  updateNotice,
  upgradeBuddyHue
} from "../src/update.mjs";

test("compares stable and prerelease semantic versions", () => {
  assert.equal(compareVersions("0.4.0", "0.3.1"), 1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("1.0.0-beta.2", "1.0.0-beta.10"), -1);
  assert.equal(compareVersions("1.0.0", "1.0.0-rc.1"), 1);
  assert.equal(compareVersions("1.0.0+build.2", "1.0.0+build.1"), 0);
  assert.equal(compareVersions("latest", "1.0.0"), null);
});

test("detects a newer official package version", async () => {
  const update = await checkForUpdate("0.4.0", {
    env: {},
    fetchImpl: async () => ({ ok: true, json: async () => ({ version: "0.5.0" }) })
  });
  assert.deepEqual(update, { currentVersion: "0.4.0", latestVersion: "0.5.0", available: true });
  assert.match(updateNotice(update), /wbhue upgrade/);
});

test("keeps update-check failures silent", async () => {
  const update = await checkForUpdate("0.4.0", {
    env: {},
    fetchImpl: async () => { throw new Error("offline"); }
  });
  assert.equal(update, null);
  assert.equal(updateNotice(update), null);
});

test("installs an available update from the official GitHub repository", async () => {
  const calls = [];
  const result = await upgradeBuddyHue("0.4.0", {
    env: {},
    cache: "/tmp/buddyhue-test-cache",
    fetchImpl: async () => ({ ok: true, json: async () => ({ version: "0.5.0" }) }),
    execFileImpl: async (command, args) => {
      calls.push([command, args]);
      return { stdout: "", stderr: "" };
    }
  });
  assert.equal(result.method, "github");
  assert.equal(result.updated, true);
  assert.deepEqual(calls, [["npm", [
    "install",
    "--global",
    OFFICIAL_GIT_SPEC,
    "--cache",
    "/tmp/buddyhue-test-cache"
  ]]]);
});

test("does not install when GitHub has no newer version", async () => {
  let executed = false;
  const result = await upgradeBuddyHue("0.4.0", {
    env: {},
    cache: "/tmp/buddyhue-test-cache",
    fetchImpl: async () => ({ ok: true, json: async () => ({ version: "0.4.0" }) }),
    execFileImpl: async () => { executed = true; }
  });
  assert.equal(executed, false);
  assert.equal(result.updated, false);
  assert.equal(result.version, "0.4.0");
});

test("falls back to a direct GitHub install when the version check fails", async () => {
  const calls = [];
  const result = await upgradeBuddyHue("0.4.0", {
    env: {},
    cache: "/tmp/buddyhue-test-cache",
    fetchImpl: async () => { throw new Error("offline check"); },
    execFileImpl: async (command, args) => {
      calls.push([command, args]);
      return { stdout: "", stderr: "" };
    }
  });
  assert.equal(result.updated, null);
  assert.deepEqual(calls, [["npm", [
    "install",
    "--global",
    OFFICIAL_GIT_SPEC,
    "--cache",
    "/tmp/buddyhue-test-cache"
  ]]]);
});
