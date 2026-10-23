import test from "node:test";
import assert from "node:assert/strict";
import { parse, run, safeErrorMessage } from "../src/cli.mjs";

test("parses WorkBuddy-friendly flags", () => {
  assert.deepEqual(parse(["apply", "skin.codedrobe-theme", "--restart", "--port", "9440", "--allow-untested"]), {
    positionals: ["apply", "skin.codedrobe-theme"],
    flags: { restart: true, port: 9440, allowUntested: true }
  });
});

test("rejects invalid ports", () => {
  assert.throws(() => parse(["doctor", "--port", "nope"]), /必须是/);
});

test("help exits successfully", async () => {
  const lines = [];
  const code = await run(["--help"], { log: (line) => lines.push(line), error: (line) => lines.push(line) });
  assert.equal(code, 0);
  assert.match(lines.join("\n"), /BuddyHue/);
  assert.match(lines.join("\n"), /theme pack/);
});

test("unknown command returns usage exit code", async () => {
  const errors = [];
  const code = await run(["unknown"], { log() {}, error: (line) => errors.push(line) });
  assert.equal(code, 2);
  assert.match(errors.join("\n"), /未知命令/);
});

test("JSON errors use the stable BuddyHue envelope", async () => {
  const errors = [];
  const code = await run(["unknown", "--json"], { log() {}, error: (line) => errors.push(line) });
  const payload = JSON.parse(errors.join("\n"));
  assert.equal(code, 2);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.tool.name, "BuddyHue");
  assert.equal(payload.tool.version, "0.4.0");
  assert.equal(payload.error.code, "BUDDYHUE_USAGE");
});

test("redacts query data from runtime error messages", () => {
  assert.equal(
    safeErrorMessage("Failed at file:///Applications/WorkBuddy/index.html?token=secret#chat"),
    "Failed at file:///Applications/WorkBuddy/index.html"
  );
});

test("prints an available update after normal command output", async () => {
  const lines = [];
  const updateCheck = Promise.resolve({ currentVersion: "0.4.0", latestVersion: "0.5.0", available: true });
  const code = await run(["--help"], { log: (line) => lines.push(line), error() {} }, { updateCheck });
  assert.equal(code, 0);
  assert.match(lines.at(-1), /0\.5\.0/);
  assert.match(lines.at(-1), /wbhue upgrade/);
});

test("silently ignores failed update checks", async () => {
  const lines = [];
  const code = await run(["--help"], { log: (line) => lines.push(line), error() {} }, {
    updateCheck: Promise.reject(new Error("offline"))
  });
  assert.equal(code, 0);
  assert.equal(lines.length, 1);
});

test("does not append human update text to JSON output", async () => {
  const errors = [];
  const logs = [];
  const code = await run(["unknown", "--json"], { log: (line) => logs.push(line), error: (line) => errors.push(line) }, {
    updateCheck: Promise.resolve({ currentVersion: "0.4.0", latestVersion: "0.5.0", available: true })
  });
  assert.equal(code, 2);
  assert.equal(logs.length, 0);
  assert.equal(JSON.parse(errors.join("\n")).error.code, "BUDDYHUE_USAGE");
});

test("runs the upgrade command without a second update notice", async () => {
  const lines = [];
  const code = await run(["upgrade"], { log: (line) => lines.push(line), error() {} }, {
    updateCheck: Promise.resolve({ currentVersion: "0.4.0", latestVersion: "0.6.0", available: true }),
    upgrade: async (currentVersion) => ({
      command: "upgrade",
      ok: true,
      updated: true,
      previousVersion: currentVersion,
      version: "0.5.0"
    })
  });
  assert.equal(code, 0);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /0\.4\.0 → 0\.5\.0/);
});
