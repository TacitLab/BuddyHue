import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { createThemeProject, inspectTheme, packTheme, sanitizeTargetUrl, validateTheme } from "../src/buddyhue.mjs";

const manifest = path.resolve("themes/starter/theme.json");

test("starter theme validates", async () => {
  const result = await validateTheme(manifest);
  assert.equal(result.ok, true);
  assert.equal(result.theme.id, "buddyhue-starter");
  assert.deepEqual(result.targets, ["workbuddy"]);
});

test("starter theme packs and inspects", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "buddyhue-test-"));
  const output = path.join(temp, "starter.codedrobe-theme");
  const packed = await packTheme(manifest, output);
  const inspected = await inspectTheme(output);
  assert.equal(packed.output, output);
  assert.equal(inspected.theme.id, "buddyhue-starter");
  assert.deepEqual(inspected.targets, ["workbuddy"]);
});

test("creates a safe WorkBuddy theme project", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "buddyhue-create-"));
  const output = path.join(temp, "Ocean Brand");
  const created = await createThemeProject(output, { name: "Ocean Brand" });
  const validated = await validateTheme(created.manifest);
  assert.equal(created.theme.id, "ocean-brand");
  assert.equal(validated.theme.displayName, "Ocean Brand");
});

test("redacts sensitive target query and hash data", () => {
  assert.equal(
    sanitizeTargetUrl("file:///Applications/WorkBuddy.app/index.html?token=secret#chat"),
    "file:///Applications/WorkBuddy.app/index.html"
  );
});
