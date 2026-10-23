import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createThemeProject, packTheme } from "../src/buddyhue.mjs";
import {
  getInstalledTheme,
  installThemePackage,
  libraryDirectory,
  listInstalledThemes,
  parseThemeSelector,
  removeInstalledTheme,
  resolveThemeInput
} from "../src/library.mjs";
import { readBuddyHuePackage } from "../src/theme-package.mjs";

async function createPackage(root, version, css = ":root { --accent: blue; }\n") {
  const project = path.join(root, "project");
  const manifestPath = path.join(project, "buddyhue.json");
  try {
    await createThemeProject(project, { id: "ocean-brand", name: "Ocean Brand" });
  } catch (error) {
    if (!/目录已存在/.test(error.message)) throw error;
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = version;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(project, "workbuddy.css"), css);
  const output = path.join(root, `ocean-${version}-${Date.now()}.buddyhue-theme`);
  await packTheme(manifestPath, output);
  return output;
}

test("uses the BuddyHue home directory", () => {
  assert.equal(
    libraryDirectory({ env: { BUDDYHUE_HOME: "/tmp/custom-buddyhue" }, home: "/Users/example" }),
    "/tmp/custom-buddyhue/themes"
  );
  assert.equal(
    libraryDirectory({ env: {}, platform: "darwin", home: "/Users/example" }),
    "/Users/example/.buddyhue/themes"
  );
  assert.equal(
    libraryDirectory({ env: { BUDDYHUE_HOME: "~/.custom-buddyhue" }, home: "/Users/example" }),
    "/Users/example/.custom-buddyhue/themes"
  );
});

test("parses installed theme references", () => {
  assert.deepEqual(parseThemeSelector("ocean-brand"), { id: "ocean-brand", version: null });
  assert.deepEqual(parseThemeSelector("ocean-brand@1.2.3"), { id: "ocean-brand", version: "1.2.3" });
  assert.throws(() => parseThemeSelector("../ocean"), /必须使用/);
});

test("installs, lists and resolves the newest theme version", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "buddyhue-library-"));
  const options = { env: { BUDDYHUE_HOME: path.join(temp, ".buddyhue") } };
  const versionOne = await createPackage(temp, "1.0.0");
  const versionTwo = await createPackage(temp, "1.1.0", ":root { --accent: purple; }\n");
  const firstInstall = await installThemePackage(versionOne, options);
  const repeatedInstall = await installThemePackage(versionOne, options);
  await installThemePackage(versionTwo, options);
  assert.equal(firstInstall.alreadyInstalled, false);
  assert.equal(repeatedInstall.alreadyInstalled, true);
  const listed = await listInstalledThemes(options);
  assert.deepEqual(listed.themes.map((theme) => theme.version), ["1.1.0", "1.0.0"]);
  assert.equal((await getInstalledTheme("ocean-brand", options)).version, "1.1.0");
  assert.equal((await getInstalledTheme("ocean-brand@1.0.0", options)).version, "1.0.0");
  assert.match(await resolveThemeInput("ocean-brand", options), /1\.1\.0\.buddyhue-theme$/);
});

test("requires force to replace different content at the same version", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "buddyhue-conflict-"));
  const options = { env: { BUDDYHUE_HOME: path.join(temp, ".buddyhue") } };
  const original = await createPackage(temp, "1.0.0");
  await installThemePackage(original, options);
  const replacement = await createPackage(temp, "1.0.0", ":root { --accent: green; }\n");
  await assert.rejects(() => installThemePackage(replacement, options), (error) => error.code === "BUDDYHUE_LIBRARY_CONFLICT");
  const installed = await installThemePackage(replacement, { ...options, force: true });
  assert.equal(installed.alreadyInstalled, false);
});

test("force repairs a corrupted installed package", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "buddyhue-repair-"));
  const options = { env: { BUDDYHUE_HOME: path.join(temp, ".buddyhue") } };
  const source = await createPackage(temp, "1.0.0");
  const installed = await installThemePackage(source, options);
  await writeFile(installed.entry.file, "{}\n");
  const repaired = await installThemePackage(source, { ...options, force: true });
  assert.equal(repaired.alreadyInstalled, false);
  assert.equal((await readBuddyHuePackage(repaired.entry.file)).theme.id, "ocean-brand");
});

test("protects the active version and removes inactive versions", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "buddyhue-remove-"));
  const options = { env: { BUDDYHUE_HOME: path.join(temp, ".buddyhue") } };
  const versionOne = await createPackage(temp, "1.0.0");
  const versionTwo = await createPackage(temp, "1.1.0", ":root { --accent: purple; }\n");
  await installThemePackage(versionOne, options);
  await installThemePackage(versionTwo, options);
  const activeBundle = await readBuddyHuePackage(versionTwo);
  const active = {
    theme: activeBundle.theme,
    package: { file: versionTwo, digest: activeBundle.integrity.digest }
  };
  await assert.rejects(
    () => removeInstalledTheme("ocean-brand@1.1.0", { ...options, active }),
    (error) => error.code === "BUDDYHUE_ACTIVE_THEME"
  );
  const removed = await removeInstalledTheme("ocean-brand@1.0.0", { ...options, active });
  assert.equal(removed.removed.length, 1);
  assert.equal((await listInstalledThemes({ ...options, active })).themes[0].active, true);
});
