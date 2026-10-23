import { execFile as execFileCallback } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { buddyHueHome } from "./paths.mjs";

const execFile = promisify(execFileCallback);

export const LATEST_PACKAGE_URL = "https://raw.githubusercontent.com/TacitLab/BuddyHue/main/package.json";
export const OFFICIAL_GIT_SPEC = "github:TacitLab/BuddyHue#main";

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(value));
  if (!match) return null;
  return {
    numbers: match.slice(1, 4).map(Number),
    prerelease: match[4]?.split(".") ?? []
  };
}

function comparePrerelease(left, right) {
  if (!left.length && !right.length) return 0;
  if (!left.length) return 1;
  if (!right.length) return -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    if (left[index] === right[index]) continue;
    const leftNumber = /^\d+$/.test(left[index]) ? Number(left[index]) : null;
    const rightNumber = /^\d+$/.test(right[index]) ? Number(right[index]) : null;
    if (leftNumber !== null && rightNumber !== null) return Math.sign(leftNumber - rightNumber);
    if (leftNumber !== null) return -1;
    if (rightNumber !== null) return 1;
    return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

export function compareVersions(left, right) {
  const parsedLeft = parseVersion(left);
  const parsedRight = parseVersion(right);
  if (!parsedLeft || !parsedRight) return null;
  for (let index = 0; index < 3; index += 1) {
    if (parsedLeft.numbers[index] !== parsedRight.numbers[index]) {
      return Math.sign(parsedLeft.numbers[index] - parsedRight.numbers[index]);
    }
  }
  return comparePrerelease(parsedLeft.prerelease, parsedRight.prerelease);
}

export async function checkForUpdate(currentVersion, options = {}) {
  const env = options.env ?? process.env;
  if (options.disabled || env.BUDDYHUE_DISABLE_UPDATE_CHECK === "1") return null;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 1500);
  timer.unref?.();
  try {
    const response = await fetchImpl(options.url ?? LATEST_PACKAGE_URL, {
      headers: { accept: "application/json", "user-agent": `BuddyHue/${currentVersion}` },
      signal: controller.signal
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const comparison = compareVersions(payload?.version, currentVersion);
    if (comparison === null) return null;
    return {
      currentVersion,
      latestVersion: payload.version,
      available: comparison > 0
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function upgradeError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

async function run(execImpl, command, args, options = {}) {
  try {
    return await execImpl(command, args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, ...options });
  } catch (cause) {
    const detail = String(cause?.stderr || cause?.message || "").trim();
    throw upgradeError("BUDDYHUE_UPGRADE_FAILED", detail ? `更新失败：${detail}` : "更新失败。", cause);
  }
}

export async function upgradeBuddyHue(currentVersion, options = {}) {
  const execImpl = options.execFileImpl ?? execFile;
  const checked = await checkForUpdate(currentVersion, options);
  if (checked && !checked.available) {
    return {
      command: "upgrade",
      ok: true,
      method: "github",
      previousVersion: currentVersion,
      version: currentVersion,
      remoteVersion: checked.latestVersion,
      updated: false
    };
  }

  const cache = options.cache ?? path.join(buddyHueHome(), "npm-cache");
  await mkdir(cache, { recursive: true });
  await run(execImpl, "npm", [
    "install",
    "--global",
    options.gitSpec ?? OFFICIAL_GIT_SPEC,
    "--cache",
    cache
  ]);
  return {
    command: "upgrade",
    ok: true,
    method: "github",
    previousVersion: currentVersion,
    version: checked?.latestVersion ?? null,
    remoteVersion: checked?.latestVersion ?? null,
    updated: checked ? true : null
  };
}

export function updateNotice(update) {
  if (!update?.available) return null;
  return `发现 BuddyHue 新版本 ${update.latestVersion}（当前 ${update.currentVersion}）。运行 wbhue upgrade 更新。`;
}
