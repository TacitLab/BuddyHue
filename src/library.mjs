import { homedir } from "node:os";
import path from "node:path";
import {
  access,
  chmod,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  stat,
  unlink,
  writeFile
} from "node:fs/promises";
import {
  BUDDYHUE_EXTENSION,
  MAX_PACKAGE_BYTES,
  validateBuddyHuePackage,
  readBuddyHuePackage
} from "./theme-package.mjs";

const SELECTOR = /^([a-zA-Z0-9][a-zA-Z0-9_-]*)(?:@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?))?$/;

function libraryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function libraryDirectory({ env = process.env, platform = process.platform, home = homedir() } = {}) {
  if (env.BUDDYHUE_LIBRARY_DIR) return path.resolve(env.BUDDYHUE_LIBRARY_DIR);
  if (platform === "darwin") return path.join(home, "Library", "Application Support", "BuddyHue", "themes");
  if (platform === "win32") return path.join(env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "BuddyHue", "themes");
  return path.join(env.XDG_DATA_HOME ?? path.join(home, ".local", "share"), "buddyhue", "themes");
}

export function parseThemeSelector(value) {
  const match = String(value ?? "").match(SELECTOR);
  if (!match) {
    throw libraryError("BUDDYHUE_USAGE", "皮肤引用必须使用 <id> 或 <id>@<version>，例如 ocean-brand@1.0.0。");
  }
  return { id: match[1], version: match[2] ?? null };
}

function compareVersions(left, right) {
  const [leftCore, leftPre = ""] = left.split("-", 2);
  const [rightCore, rightPre = ""] = right.split("-", 2);
  const a = leftCore.split(".").map(Number);
  const b = rightCore.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  if (!leftPre && rightPre) return 1;
  if (leftPre && !rightPre) return -1;
  const leftParts = leftPre.split(".");
  const rightParts = rightPre.split(".");
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    if (leftParts[index] === undefined) return -1;
    if (rightParts[index] === undefined) return 1;
    if (leftParts[index] === rightParts[index]) continue;
    const leftNumeric = /^\d+$/.test(leftParts[index]);
    const rightNumeric = /^\d+$/.test(rightParts[index]);
    if (leftNumeric && rightNumeric) return Number(leftParts[index]) - Number(rightParts[index]);
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftParts[index].localeCompare(rightParts[index]);
  }
  return 0;
}

function isActive(bundle, filename, active) {
  if (!active) return false;
  if (active.package?.digest && bundle.integrity.digest === active.package.digest) return true;
  return active.theme?.id === bundle.theme.id
    && active.theme?.version === bundle.theme.version
    && path.resolve(active.package?.file ?? "") === path.resolve(filename);
}

async function packageEntry(filename, active = null) {
  const bundle = await readBuddyHuePackage(filename);
  const fileStat = await stat(filename);
  return {
    id: bundle.theme.id,
    name: bundle.theme.name,
    version: bundle.theme.version,
    description: bundle.theme.description ?? null,
    author: bundle.theme.author ?? null,
    license: bundle.theme.license ?? null,
    tags: bundle.theme.tags ?? [],
    compatibility: bundle.compatibility,
    integrity: bundle.integrity,
    createdAt: bundle.createdAt,
    installedAt: fileStat.mtime.toISOString(),
    file: path.resolve(filename),
    active: isActive(bundle, filename, active)
  };
}

async function safeLibraryThemeDirectory(root, id) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const realRoot = await realpath(root);
  const requested = path.join(realRoot, id);
  await mkdir(requested, { recursive: true, mode: 0o700 });
  const realThemeDirectory = await realpath(requested);
  if (realThemeDirectory !== realRoot && !realThemeDirectory.startsWith(`${realRoot}${path.sep}`)) {
    throw libraryError("BUDDYHUE_LIBRARY_CONFLICT", `皮肤库目录不安全：${id}`);
  }
  return { realRoot, realThemeDirectory };
}

export async function installThemePackage(filename, options = {}) {
  const source = path.resolve(filename);
  let bundle = await readBuddyHuePackage(source);
  const root = libraryDirectory(options);
  const { realThemeDirectory } = await safeLibraryThemeDirectory(root, bundle.theme.id);
  const destination = path.join(realThemeDirectory, `${bundle.theme.version}${BUDDYHUE_EXTENSION}`);
  let destinationExists = false;
  try {
    await access(destination);
    destinationExists = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (destinationExists) {
    try {
      const existing = await readBuddyHuePackage(destination);
      if (existing.integrity.digest === bundle.integrity.digest) {
        return { entry: await packageEntry(destination, options.active), alreadyInstalled: true };
      }
    } catch (error) {
      if (!options.force) throw error;
    }
    if (!options.force) {
      throw libraryError(
        "BUDDYHUE_LIBRARY_CONFLICT",
        `皮肤 ${bundle.theme.id}@${bundle.theme.version} 已存在但内容不同；如要替换，请添加 --force。`
      );
    }
  }

  const bytes = await readFile(source);
  if (bytes.length > MAX_PACKAGE_BYTES) {
    throw libraryError("BUDDYHUE_INVALID_PACKAGE", "皮肤包超过 30MB 限制。");
  }
  try {
    const copyBundle = validateBuddyHuePackage(JSON.parse(bytes.toString("utf8")));
    if (copyBundle.integrity.digest !== bundle.integrity.digest) {
      throw libraryError("BUDDYHUE_INTEGRITY_FAILED", "读取过程中皮肤包发生变化，请重试安装。");
    }
    bundle = copyBundle;
  } catch (error) {
    if (error.code) throw error;
    throw libraryError("BUDDYHUE_INVALID_PACKAGE", `无法读取皮肤包：${error.message}`);
  }
  const temporary = path.join(realThemeDirectory, `.${bundle.theme.version}.tmp-${process.pid}-${Date.now()}`);
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    await chmod(temporary, 0o600).catch(() => {});
    try {
      await rename(temporary, destination);
    } catch (error) {
      if (!options.force || !["EEXIST", "EPERM"].includes(error.code)) throw error;
      await unlink(destination);
      await rename(temporary, destination);
    }
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  return { entry: await packageEntry(destination, options.active), alreadyInstalled: false };
}

export async function listInstalledThemes(options = {}) {
  const root = libraryDirectory(options);
  let directories;
  try {
    directories = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return { directory: root, themes: [], errors: [] };
    throw error;
  }
  const themes = [];
  const errors = [];
  for (const directory of directories.filter((entry) => entry.isDirectory())) {
    const folder = path.join(root, directory.name);
    const files = await readdir(folder, { withFileTypes: true });
    for (const file of files.filter((entry) => entry.isFile() && entry.name.endsWith(BUDDYHUE_EXTENSION))) {
      const filename = path.join(folder, file.name);
      try {
        themes.push(await packageEntry(filename, options.active));
      } catch (error) {
        errors.push({ file: filename, code: error.code ?? "BUDDYHUE_INVALID_PACKAGE", message: error.message });
      }
    }
  }
  themes.sort((left, right) => left.id.localeCompare(right.id) || compareVersions(right.version, left.version));
  return { directory: root, themes, errors };
}

export async function getInstalledTheme(selector, options = {}) {
  const reference = parseThemeSelector(selector);
  const result = await listInstalledThemes(options);
  const matches = result.themes.filter((theme) => theme.id === reference.id && (!reference.version || theme.version === reference.version));
  if (!matches.length) {
    throw libraryError(
      "BUDDYHUE_THEME_NOT_INSTALLED",
      `本地皮肤库中没有 ${reference.id}${reference.version ? `@${reference.version}` : ""}。可运行 wbhue ls 查看已安装皮肤。`
    );
  }
  matches.sort((left, right) => compareVersions(right.version, left.version));
  return matches[0];
}

export function looksLikeThemePath(value) {
  const input = String(value ?? "");
  return path.isAbsolute(input)
    || input.includes("/")
    || input.includes("\\")
    || input.endsWith(BUDDYHUE_EXTENSION)
    || input.endsWith(".codedrobe-theme");
}

export async function resolveThemeInput(value, options = {}) {
  if (looksLikeThemePath(value)) return path.resolve(value);
  return (await getInstalledTheme(value, options)).file;
}

export async function removeInstalledTheme(selector, options = {}) {
  const reference = parseThemeSelector(selector);
  const result = await listInstalledThemes(options);
  const matches = result.themes.filter((theme) => theme.id === reference.id && (!reference.version || theme.version === reference.version));
  if (!matches.length) {
    throw libraryError("BUDDYHUE_THEME_NOT_INSTALLED", `本地皮肤库中没有 ${selector}。`);
  }
  if (matches.some((theme) => theme.active)) {
    throw libraryError("BUDDYHUE_ACTIVE_THEME", "不能删除当前正在使用的皮肤版本；请先运行 wbhue restore。");
  }
  for (const theme of matches) await unlink(theme.file);
  const folder = path.join(libraryDirectory(options), reference.id);
  await rmdir(folder).catch((error) => {
    if (!["ENOTEMPTY", "ENOENT"].includes(error.code)) throw error;
  });
  return { directory: libraryDirectory(options), removed: matches };
}
