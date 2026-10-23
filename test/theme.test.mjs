import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, symlink, unlink, writeFile } from "node:fs/promises";
import { createThemeProject, inspectTheme, packTheme, sanitizeTargetUrl, validateTheme } from "../src/buddyhue.mjs";
import { isVersionCompatible, readBuddyHuePackage } from "../src/theme-package.mjs";

const manifest = path.resolve("themes/starter/buddyhue.json");

test("starter theme validates", async () => {
  const result = await validateTheme(manifest);
  assert.equal(result.ok, true);
  assert.equal(result.theme.id, "buddyhue-starter");
  assert.equal(result.compatibility.workbuddy, ">=5.9.0 <5.10.0");
});

test("starter theme packs and inspects", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "buddyhue-test-"));
  const output = path.join(temp, "starter.buddyhue-theme");
  const packed = await packTheme(manifest, output);
  const inspected = await inspectTheme(output);
  assert.equal(packed.output, output);
  assert.equal(inspected.theme.id, "buddyhue-starter");
  assert.equal(inspected.format, "buddyhue-theme");
  assert.equal(inspected.integrity.algorithm, "sha256");
});

test("creates a safe WorkBuddy theme project", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "buddyhue-create-"));
  const output = path.join(temp, "Ocean Brand");
  const created = await createThemeProject(output, { name: "Ocean Brand" });
  const validated = await validateTheme(created.manifest);
  assert.equal(created.theme.id, "ocean-brand");
  assert.equal(validated.theme.name, "Ocean Brand");
});

test("redacts sensitive target query and hash data", () => {
  assert.equal(
    sanitizeTargetUrl("file:///Applications/WorkBuddy.app/index.html?token=secret#chat"),
    "file:///Applications/WorkBuddy.app/index.html"
  );
});

test("rejects a package modified after packing", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "buddyhue-tamper-"));
  const output = path.join(temp, "starter.buddyhue-theme");
  await packTheme(manifest, output);
  const bundle = JSON.parse(await readFile(output, "utf8"));
  bundle.payload.css += "\nbody { opacity: 0.5; }\n";
  await writeFile(output, `${JSON.stringify(bundle, null, 2)}\n`);
  await assert.rejects(() => readBuddyHuePackage(output), (error) => error.code === "BUDDYHUE_INTEGRITY_FAILED");
});

test("rejects external CSS resources", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "buddyhue-external-"));
  const project = path.join(temp, "theme");
  const created = await createThemeProject(project);
  await writeFile(path.join(project, "workbuddy.css"), "@import url('https://example.com/theme.css');\n");
  await assert.rejects(() => validateTheme(created.manifest), /external CSS resource/);
});

test("rejects unsupported package extensions", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "buddyhue-extension-"));
  const output = path.join(temp, "starter.json");
  await writeFile(output, "{}\n");
  await assert.rejects(() => readBuddyHuePackage(output), (error) => error.code === "BUDDYHUE_INVALID_PACKAGE");
});

test("rejects unknown package fields", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "buddyhue-unknown-"));
  const output = path.join(temp, "starter.buddyhue-theme");
  await packTheme(manifest, output);
  const bundle = JSON.parse(await readFile(output, "utf8"));
  bundle.executable = "not-allowed";
  await writeFile(output, `${JSON.stringify(bundle, null, 2)}\n`);
  await assert.rejects(() => readBuddyHuePackage(output), /未知字段/);
});

test("rejects symlinked resources outside the theme project", { skip: process.platform === "win32" }, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "buddyhue-symlink-"));
  const project = path.join(temp, "theme");
  const created = await createThemeProject(project);
  const outside = path.join(temp, "outside.css");
  await writeFile(outside, ":root { color: red; }\n");
  await unlink(path.join(project, "workbuddy.css"));
  await symlink(outside, path.join(project, "workbuddy.css"));
  await assert.rejects(() => validateTheme(created.manifest), /越出皮肤工程目录/);
});

test("evaluates declared WorkBuddy version ranges", () => {
  assert.equal(isVersionCompatible("5.9.1", ">=5.9.0 <5.10.0"), true);
  assert.equal(isVersionCompatible("5.10.0", ">=5.9.0 <5.10.0"), false);
  assert.equal(isVersionCompatible("5.8.9", ">=5.9.0 <5.10.0"), false);
});
