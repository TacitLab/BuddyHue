import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { discoverApp, findRunningPids, listCdpTargets } from "@codedrobe/core";
import { workbuddyAdapter } from "./adapter.mjs";

const execFileAsync = promisify(execFile);

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

async function macBundleValue(appPath, key) {
  const plist = path.join(appPath, "Contents", "Info.plist");
  try {
    const { stdout } = await execFileAsync("plutil", ["-extract", key, "raw", plist]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function windowsVersion(executable) {
  const escaped = executable.replaceAll("'", "''");
  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `(Get-Item '${escaped}').VersionInfo.ProductVersion`
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function inspectInstallation(appPath = null) {
  const installation = await discoverApp(workbuddyAdapter, process.platform, appPath);
  if (!installation) return null;

  let version = null;
  let build = null;
  let bundleId = null;
  if (process.platform === "darwin") {
    version = await macBundleValue(installation.appPath, "CFBundleShortVersionString");
    build = await macBundleValue(installation.appPath, "CFBundleVersion");
    bundleId = await macBundleValue(installation.appPath, "CFBundleIdentifier");
  } else if (process.platform === "win32") {
    version = await windowsVersion(installation.executable);
    build = version;
  }

  return { ...installation, version, build, bundleId };
}

export async function runtimeStatus({ appPath = null, port = workbuddyAdapter.defaultPort, timeoutMs = 750 } = {}) {
  const installation = await inspectInstallation(appPath);
  let pids = [];
  let processError = null;
  if (installation) {
    try {
      pids = await findRunningPids(workbuddyAdapter, process.platform, installation.executable);
    } catch (error) {
      processError = error.message;
    }
  }
  let targets = [];
  let cdpError = null;
  try {
    targets = (await listCdpTargets(port, timeoutMs)).filter((target) => workbuddyAdapter.matchTarget(target));
  } catch (error) {
    cdpError = error.message;
  }
  return {
    installation,
    running: pids.length > 0,
    pids,
    processError,
    cdp: { ready: targets.length > 0, port, targetCount: targets.length, error: cdpError }
  };
}

export async function assertThemePath(filename) {
  const resolved = path.resolve(filename);
  if (!(await exists(resolved))) throw new Error(`找不到皮肤包：${resolved}`);
  return resolved;
}
