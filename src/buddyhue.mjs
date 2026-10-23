import path from "node:path";
import { access, mkdir, writeFile } from "node:fs/promises";
import {
  VERSION as codeDrobeVersion,
  applySkin,
  probeApp,
  restoreSkin,
  snapshotDom,
  verifyTheme,
  watchTheme
} from "@codedrobe/core";
import { isSupportedVersion, workbuddyAdapter } from "./adapter.mjs";
import { assertThemePath, runtimeStatus } from "./system.mjs";
import { clearState, readState, recordAppliedState } from "./state.mjs";
import {
  getInstalledTheme,
  installThemePackage,
  libraryDirectory,
  listInstalledThemes,
  removeInstalledTheme,
  resolveThemeInput
} from "./library.mjs";
import {
  BUDDYHUE_EXTENSION,
  BUDDYHUE_FORMAT,
  buildBuddyHuePackage,
  isVersionCompatible,
  loadThemeArtifact,
  writeBuddyHuePackage
} from "./theme-package.mjs";

export const BUDDYHUE_VERSION = "0.3.0";

function summarizeTargets(targets) {
  return targets.map(({ targetId, title, url, result }) => ({
    targetId,
    title: title ?? null,
    url: sanitizeTargetUrl(url),
    compatible: result.compatible ?? null,
    pass: result.pass ?? null,
    installed: result.installed ?? null,
    themeId: result.themeId ?? null,
    themeVersion: result.version ?? null,
    warnings: result.warnings ?? [],
    missing: result.missing ?? []
  }));
}

export function sanitizeTargetUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return String(value).split(/[?#]/, 1)[0];
  }
}

export async function doctor(options = {}) {
  const runtime = await runtimeStatus(options);
  const versionSupported = isSupportedVersion(runtime.installation?.version);
  return {
    command: "doctor",
    ok: Boolean(runtime.installation) && versionSupported,
    buddyHueVersion: BUDDYHUE_VERSION,
    codeDrobeVersion,
    platform: process.platform,
    supportedPlatform: ["darwin", "win32"].includes(process.platform),
    versionSupported,
    supportedRange: "5.9.x",
    ...runtime,
    guidance: !runtime.installation
      ? "未找到 WorkBuddy。可使用 --app-path 指定安装路径。"
      : !versionSupported
        ? `WorkBuddy ${runtime.installation.version ?? "未知版本"} 尚未验证；应用时需显式添加 --allow-untested。`
        : runtime.running && !runtime.cdp.ready
          ? "WorkBuddy 正在运行但未开启调试通道。应用皮肤时添加 --restart。"
          : "环境可以使用 BuddyHue。"
  };
}

export async function probe(options = {}) {
  const artifact = options.theme ? await loadArtifact(options.theme, options) : null;
  const targets = await probeApp({
    adapter: workbuddyAdapter,
    targetTheme: artifact?.targetTheme ?? null,
    port: options.port ?? workbuddyAdapter.defaultPort,
    timeoutMs: options.timeoutMs
  });
  return { command: "probe", ok: targets.some((item) => item.result.compatible), targets: summarizeTargets(targets) };
}

export async function preflight(filename, options = {}) {
  const artifact = await loadArtifact(filename, options);
  const runtime = await runtimeStatus(options);
  const adapterCompatible = isSupportedVersion(runtime.installation?.version);
  const packageCompatible = artifact.compatibility
    ? isVersionCompatible(runtime.installation?.version, artifact.compatibility.workbuddy)
    : null;
  let targets = [];
  if (runtime.cdp.ready) {
    targets = await probeApp({
      adapter: workbuddyAdapter,
      targetTheme: artifact.targetTheme,
      port: options.port ?? workbuddyAdapter.defaultPort,
      timeoutMs: options.timeoutMs
    });
  }
  const domCompatible = targets.length ? targets.some((item) => item.result.compatible) : null;
  const requiresRestart = runtime.running && !runtime.cdp.ready;
  const ready = Boolean(runtime.installation)
    && adapterCompatible
    && packageCompatible !== false
    && domCompatible !== false;
  return {
    command: "preflight",
    ok: ready,
    ready,
    requiresRestart,
    artifact: artifactSummary(artifact),
    compatibility: {
      appVersion: runtime.installation?.version ?? null,
      adapterRange: "5.9.x",
      adapterCompatible,
      packageRange: artifact.compatibility?.workbuddy ?? null,
      packageCompatible,
      domCompatible
    },
    runtime,
    targets: summarizeTargets(targets)
  };
}

export async function status(options = {}) {
  const runtime = await runtimeStatus(options);
  const receipt = await readState();
  if (!runtime.cdp.ready) return { command: "status", ok: true, ...runtime, theme: receipt?.active?.theme ?? null, receipt };
  const targets = await verifyTheme({
    adapter: workbuddyAdapter,
    port: options.port ?? workbuddyAdapter.defaultPort,
    timeoutMs: options.timeoutMs
  });
  const first = targets.find((item) => item.result.installed);
  return {
    command: "status",
    ok: true,
    ...runtime,
    theme: first ? { id: first.result.themeId, version: first.result.version } : null,
    receipt,
    targets: summarizeTargets(targets)
  };
}

export async function loadArtifact(filename, options = {}) {
  const input = await resolveThemeInput(filename, options);
  const resolved = await assertThemePath(input);
  return loadThemeArtifact(resolved);
}

export async function loadTarget(filename, options = {}) {
  return (await loadArtifact(filename, options)).targetTheme;
}

function artifactSummary(artifact) {
  return {
    file: artifact.file,
    format: artifact.format,
    theme: artifact.theme,
    compatibility: artifact.compatibility,
    integrity: artifact.integrity,
    images: artifact.images,
    warnings: artifact.warnings
  };
}

export async function apply(filename, options = {}) {
  const artifact = await loadArtifact(filename, options);
  const runtime = await runtimeStatus(options);
  const supported = isSupportedVersion(runtime.installation?.version);
  if (!runtime.installation) {
    const error = new Error("未找到 WorkBuddy。请安装 WorkBuddy，或使用 --app-path 指定路径。");
    error.code = "BUDDYHUE_APP_NOT_FOUND";
    throw error;
  }
  if (!supported && !options.allowUntested) {
    const error = new Error(`WorkBuddy ${runtime.installation.version ?? "未知版本"} 不在已验证范围 5.9.x；如已确认风险，请添加 --allow-untested。`);
    error.code = "BUDDYHUE_UNSUPPORTED_VERSION";
    throw error;
  }
  const packageCompatible = artifact.compatibility
    ? isVersionCompatible(runtime.installation.version, artifact.compatibility.workbuddy)
    : null;
  if (packageCompatible === false && !options.allowUntested) {
    const error = new Error(`皮肤声明支持 ${artifact.compatibility.workbuddy}，当前 WorkBuddy 为 ${runtime.installation.version}；如已确认风险，请添加 --allow-untested。`);
    error.code = "BUDDYHUE_THEME_INCOMPATIBLE";
    throw error;
  }
  const result = await applySkin({
    adapter: workbuddyAdapter,
    targetTheme: artifact.targetTheme,
    port: options.port,
    launch: true,
    appPath: options.appPath,
    restartExisting: options.restart,
    timeoutMs: options.timeoutMs
  });
  let state = { recorded: true, error: null };
  try {
    await recordAppliedState({
      artifact,
      appVersion: runtime.installation.version,
      port: result.port
    });
  } catch (error) {
    state = { recorded: false, error: error.message };
  }
  return {
    ...result,
    targets: summarizeTargets(result.targets),
    ok: true,
    state,
    artifact: artifactSummary(artifact),
    compatibility: {
      appVersion: runtime.installation.version,
      adapterCompatible: supported,
      packageCompatible
    }
  };
}

export async function verify(filename, options = {}) {
  const targetTheme = filename ? await loadTarget(filename, options) : null;
  const targets = await verifyTheme({
    adapter: workbuddyAdapter,
    targetTheme,
    port: options.port ?? workbuddyAdapter.defaultPort,
    timeoutMs: options.timeoutMs
  });
  return { command: "verify", ok: targets.length > 0 && targets.every((item) => item.result.pass !== false), targets: summarizeTargets(targets) };
}

export async function restore(options = {}) {
  const result = await restoreSkin({ adapter: workbuddyAdapter, port: options.port, timeoutMs: options.timeoutMs });
  let state = { cleared: true, error: null };
  try {
    await clearState();
  } catch (error) {
    state = { cleared: false, error: error.message };
  }
  return {
    ...result,
    renderer: {
      ...result.renderer,
      ...(result.renderer.targets ? {
        targets: result.renderer.targets.map(({ targetId, title, url, result: restored }) => ({
          targetId,
          title: title ?? null,
          url: sanitizeTargetUrl(url),
          result: restored
        }))
      } : {})
    },
    state,
    ok: true
  };
}

export async function watch(filename, options = {}) {
  const targetTheme = await loadTarget(filename, options);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await watchTheme({
    adapter: workbuddyAdapter,
    targetTheme,
    port: options.port ?? workbuddyAdapter.defaultPort,
    timeoutMs: options.timeoutMs,
    signal: controller.signal,
    onEvent: options.onEvent
  });
  return { command: "watch", ok: true };
}

export async function snapshot(output, options = {}) {
  const targets = await snapshotDom({
    adapter: workbuddyAdapter,
    port: options.port ?? workbuddyAdapter.defaultPort,
    timeoutMs: options.timeoutMs,
    maxNodes: options.maxNodes,
    includeHidden: options.includeHidden
  });
  const { writeFile } = await import("node:fs/promises");
  const resolved = path.resolve(output);
  await writeFile(resolved, `${JSON.stringify({ schemaVersion: 1, app: "workbuddy", targets }, null, 2)}\n`);
  return { command: "snapshot", ok: true, output: resolved, targetCount: targets.length };
}

export async function packTheme(manifest, output, options = {}) {
  const result = await writeBuddyHuePackage(path.resolve(manifest), path.resolve(output), { force: options.force });
  return {
    command: "theme pack",
    ok: true,
    output: result.output,
    format: BUDDYHUE_FORMAT,
    theme: result.bundle.theme,
    compatibility: result.bundle.compatibility,
    integrity: result.bundle.integrity,
    images: Object.keys(result.bundle.payload.images ?? {}),
    warnings: result.warnings
  };
}

export async function validateTheme(manifest) {
  const { bundle, warnings } = await buildBuddyHuePackage(path.resolve(manifest));
  return {
    command: "theme validate",
    ok: true,
    format: BUDDYHUE_FORMAT,
    theme: bundle.theme,
    compatibility: bundle.compatibility,
    images: Object.keys(bundle.payload.images ?? {}),
    warnings
  };
}

export async function inspectTheme(filename) {
  const artifact = await loadArtifact(filename);
  return { command: "theme inspect", ok: true, ...artifactSummary(artifact) };
}

export async function installTheme(filename, options = {}) {
  const receipt = await readState(options);
  const result = await installThemePackage(path.resolve(filename), { ...options, active: receipt?.active ?? null });
  return {
    command: "install",
    ok: true,
    alreadyInstalled: result.alreadyInstalled,
    theme: result.entry,
    directory: libraryDirectory(options)
  };
}

export async function listThemes(options = {}) {
  const receipt = await readState(options);
  const result = await listInstalledThemes({ ...options, active: receipt?.active ?? null });
  return { command: "ls", ok: true, ...result };
}

export async function infoTheme(selector, options = {}) {
  const receipt = await readState(options);
  const theme = await getInstalledTheme(selector, { ...options, active: receipt?.active ?? null });
  return { command: "info", ok: true, theme };
}

export async function removeTheme(selector, options = {}) {
  const receipt = await readState(options);
  const result = await removeInstalledTheme(selector, { ...options, active: receipt?.active ?? null });
  return { command: "remove", ok: true, ...result };
}

function safeThemeId(value) {
  const id = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return id || "my-workbuddy-theme";
}

export async function createThemeProject(directory, options = {}) {
  const output = path.resolve(directory);
  try {
    await access(output);
    if (!options.force) throw new Error(`目录已存在：${output}。如需覆盖生成文件，请添加 --force。`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(output, { recursive: true });
  const id = safeThemeId(options.id ?? path.basename(output));
  const displayName = options.name ?? id.split("-").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ");
  const manifest = {
    $schema: "../../schemas/buddyhue-manifest.schema.json",
    schemaVersion: 1,
    id,
    name: displayName,
    version: "0.1.0",
    description: options.description ?? "A custom WorkBuddy theme made with BuddyHue.",
    compatibility: { workbuddy: ">=5.9.0 <5.10.0" },
    css: "workbuddy.css",
    verification: {
      recommended: [{
        name: "composer",
        any: ["[role='textbox'][contenteditable='true']", ".wb-home-composer [contenteditable='true']"]
      }]
    }
  };
  const css = `:root {
  --buddyhue-accent: #6c5ce7;
  --buddyhue-accent-soft: color-mix(in srgb, var(--buddyhue-accent), transparent 86%);
}

/* Add stable, scoped WorkBuddy styles below. */
[class*="sidebar"],
[data-testid*="sidebar"] {
  background-image: linear-gradient(180deg, var(--buddyhue-accent-soft), transparent 40%);
}
`;
  await writeFile(path.join(output, "buddyhue.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: options.force ? "w" : "wx" });
  await writeFile(path.join(output, "workbuddy.css"), css, { flag: options.force ? "w" : "wx" });
  return {
    command: "theme create",
    ok: true,
    output,
    manifest: path.join(output, "buddyhue.json"),
    packageExtension: BUDDYHUE_EXTENSION,
    theme: { id, name: displayName, version: "0.1.0" }
  };
}
