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
  assert.equal(payload.tool.version, "0.2.0");
  assert.equal(payload.error.code, "BUDDYHUE_USAGE");
});

test("redacts query data from runtime error messages", () => {
  assert.equal(
    safeErrorMessage("Failed at file:///Applications/WorkBuddy/index.html?token=secret#chat"),
    "Failed at file:///Applications/WorkBuddy/index.html"
  );
});
