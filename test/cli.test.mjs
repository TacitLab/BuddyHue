import test from "node:test";
import assert from "node:assert/strict";
import { parse, run } from "../src/cli.mjs";

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
