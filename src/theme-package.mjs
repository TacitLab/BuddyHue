import { createHash, timingSafeEqual } from "node:crypto";
import {
  access,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import {
  lintThemePackage,
  readThemePackage as readCodeDrobePackage,
  resolveThemeTarget,
  validateThemePackage as validateCodeDrobePackage
} from "@codedrobe/core";

export const BUDDYHUE_FORMAT = "buddyhue-theme";
export const BUDDYHUE_SCHEMA_VERSION = 1;
export const BUDDYHUE_EXTENSION = ".buddyhue-theme";
export const MAX_PACKAGE_BYTES = 30 * 1024 * 1024;
export const MAX_CSS_BYTES = 1024 * 1024;
export const MAX_IMAGES = 32;

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const WORKBUDDY_RANGE = /^>=(\d+\.\d+\.\d+)\s+<(\d+\.\d+\.\d+)$/;
const SAFE_IMAGE_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"]
]);

function themeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertObject(value, label) {
  if (!isObject(value)) throw themeError("BUDDYHUE_INVALID_PACKAGE", `${label} 必须是对象。`);
}

function assertString(value, label, { optional = false } = {}) {
  if (optional && value === undefined) return;
  if (typeof value !== "string" || !value.trim()) {
    throw themeError("BUDDYHUE_INVALID_PACKAGE", `${label} 必须是非空字符串。`);
  }
}

function assertKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw themeError("BUDDYHUE_INVALID_PACKAGE", `${label} 包含未知字段 '${key}'。`);
  }
}

function compareVersions(left, right) {
  const a = String(left).split("-")[0].split(".").map(Number);
  const b = String(right).split("-")[0].split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

export function validateCompatibilityRange(range) {
  if (typeof range !== "string") throw themeError("BUDDYHUE_INVALID_PACKAGE", "compatibility.workbuddy 必须是版本范围字符串。");
  const match = range.match(WORKBUDDY_RANGE);
  if (!match) {
    throw themeError("BUDDYHUE_INVALID_PACKAGE", "compatibility.workbuddy 必须使用固定格式，例如 '>=5.9.0 <5.10.0'。");
  }
  if (compareVersions(match[1], match[2]) >= 0) {
    throw themeError("BUDDYHUE_INVALID_PACKAGE", "compatibility.workbuddy 的最低版本必须小于最高版本。");
  }
  return range;
}

export function isVersionCompatible(version, range) {
  if (!version || !range) return false;
  const match = String(range).match(WORKBUDDY_RANGE);
  if (!match) return false;
  return compareVersions(version, match[1]) >= 0 && compareVersions(version, match[2]) < 0;
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function packageDigest(bundle) {
  const { integrity: _integrity, ...body } = bundle;
  return createHash("sha256").update(canonicalize(body)).digest("hex");
}

function safeEqualHex(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function normalizeTheme(theme) {
  assertObject(theme, "theme");
  assertKeys(theme, ["id", "name", "version", "description", "author", "license", "tags"], "theme");
  assertString(theme.id, "theme.id");
  if (!SAFE_ID.test(theme.id)) throw themeError("BUDDYHUE_INVALID_PACKAGE", "theme.id 只能包含字母、数字、连字符和下划线。");
  assertString(theme.name, "theme.name");
  assertString(theme.version, "theme.version");
  if (!SEMVER.test(theme.version)) throw themeError("BUDDYHUE_INVALID_PACKAGE", "theme.version 必须是语义化版本号。");
  for (const key of ["description", "author", "license"]) assertString(theme[key], `theme.${key}`, { optional: true });
  if (theme.tags !== undefined) {
    if (!Array.isArray(theme.tags) || theme.tags.length > 12 || theme.tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.length > 32)) {
      throw themeError("BUDDYHUE_INVALID_PACKAGE", "theme.tags 必须是不超过 12 项的短字符串数组。");
    }
  }
  return {
    id: theme.id,
    name: theme.name,
    version: theme.version,
    ...(theme.description ? { description: theme.description } : {}),
    ...(theme.author ? { author: theme.author } : {}),
    ...(theme.license ? { license: theme.license } : {}),
    ...(theme.tags ? { tags: [...theme.tags] } : {})
  };
}

function validateCompatibility(compatibility) {
  assertObject(compatibility, "compatibility");
  assertKeys(compatibility, ["workbuddy"], "compatibility");
  return { workbuddy: validateCompatibilityRange(compatibility.workbuddy) };
}

function normalizeImages(images) {
  if (images === undefined) return undefined;
  assertObject(images, "payload.images");
  const entries = Object.entries(images);
  if (!entries.length || entries.length > MAX_IMAGES) {
    throw themeError("BUDDYHUE_INVALID_PACKAGE", `payload.images 必须包含 1 到 ${MAX_IMAGES} 项。`);
  }
  return Object.fromEntries(entries.map(([id, image]) => {
    if (!SAFE_ID.test(id)) throw themeError("BUDDYHUE_INVALID_PACKAGE", `图片 ID '${id}' 不合法。`);
    assertObject(image, `payload.images.${id}`);
    assertKeys(image, ["filename", "mimeType", "base64"], `payload.images.${id}`);
    assertString(image.filename, `payload.images.${id}.filename`);
    assertString(image.mimeType, `payload.images.${id}.mimeType`);
    assertString(image.base64, `payload.images.${id}.base64`);
    if (path.basename(image.filename) !== image.filename) throw themeError("BUDDYHUE_INVALID_PACKAGE", `图片 '${id}' 的文件名不安全。`);
    if (![...SAFE_IMAGE_TYPES.values()].includes(image.mimeType)) throw themeError("BUDDYHUE_INVALID_PACKAGE", `图片 '${id}' 的格式不受支持。`);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.base64)) {
      throw themeError("BUDDYHUE_INVALID_PACKAGE", `图片 '${id}' 不是有效 Base64。`);
    }
    return [id, { filename: image.filename, mimeType: image.mimeType, base64: image.base64 }];
  }));
}

function toCodeDrobeBundle(bundle) {
  const codeDrobe = {
    format: "codedrobe-theme",
    schemaVersion: 1,
    theme: {
      id: bundle.theme.id,
      displayName: bundle.theme.name,
      version: bundle.theme.version,
      ...(bundle.theme.description ? { copy: { tagline: bundle.theme.description } } : {})
    },
    targets: {
      workbuddy: {
        css: bundle.payload.css,
        ...(bundle.payload.verification ? { verification: bundle.payload.verification } : {})
      }
    },
    ...(bundle.payload.images ? { assets: { images: bundle.payload.images } } : {})
  };
  return validateCodeDrobePackage(codeDrobe);
}

function buddyHueLintWarnings(bundle) {
  return lintThemePackage(toCodeDrobeBundle(bundle)).filter((warning) => !String(warning.code).startsWith("missing-catalog-"));
}

export function validateBuddyHuePackage(input, { verifyIntegrity = true } = {}) {
  assertObject(input, "皮肤包");
  assertKeys(input, ["format", "schemaVersion", "createdAt", "theme", "compatibility", "payload", "integrity"], "皮肤包");
  if (input.format !== BUDDYHUE_FORMAT) throw themeError("BUDDYHUE_INVALID_PACKAGE", `不支持的皮肤包格式 '${input.format ?? "missing"}'。`);
  if (input.schemaVersion !== BUDDYHUE_SCHEMA_VERSION) throw themeError("BUDDYHUE_INVALID_PACKAGE", `不支持的 schemaVersion '${input.schemaVersion ?? "missing"}'。`);
  assertString(input.createdAt, "createdAt");
  if (Number.isNaN(Date.parse(input.createdAt))) throw themeError("BUDDYHUE_INVALID_PACKAGE", "createdAt 必须是 ISO 日期。");
  const theme = normalizeTheme(input.theme);
  const compatibility = validateCompatibility(input.compatibility);
  assertObject(input.payload, "payload");
  assertKeys(input.payload, ["css", "images", "verification"], "payload");
  assertString(input.payload.css, "payload.css");
  if (Buffer.byteLength(input.payload.css) > MAX_CSS_BYTES) throw themeError("BUDDYHUE_INVALID_PACKAGE", "CSS 超过 1MB 限制。");
  const payload = {
    css: input.payload.css,
    ...(input.payload.images ? { images: normalizeImages(input.payload.images) } : {}),
    ...(input.payload.verification ? { verification: input.payload.verification } : {})
  };
  assertObject(input.integrity, "integrity");
  assertKeys(input.integrity, ["algorithm", "digest"], "integrity");
  if (input.integrity.algorithm !== "sha256") throw themeError("BUDDYHUE_INVALID_PACKAGE", "integrity.algorithm 仅支持 sha256。");
  assertString(input.integrity.digest, "integrity.digest");
  const normalized = {
    format: BUDDYHUE_FORMAT,
    schemaVersion: BUDDYHUE_SCHEMA_VERSION,
    createdAt: input.createdAt,
    theme,
    compatibility,
    payload,
    integrity: { algorithm: "sha256", digest: input.integrity.digest }
  };
  toCodeDrobeBundle(normalized);
  if (verifyIntegrity) {
    const expected = packageDigest(normalized);
    if (!safeEqualHex(expected, normalized.integrity.digest)) {
      throw themeError("BUDDYHUE_INTEGRITY_FAILED", "皮肤包完整性校验失败，文件可能已损坏或被修改。");
    }
  }
  return normalized;
}

function validateSourceManifest(source) {
  assertObject(source, "manifest");
  assertKeys(source, ["$schema", "schemaVersion", "id", "name", "version", "description", "author", "license", "tags", "compatibility", "css", "images", "verification"], "manifest");
  if (source.schemaVersion !== BUDDYHUE_SCHEMA_VERSION) throw themeError("BUDDYHUE_INVALID_PACKAGE", "manifest.schemaVersion 必须为 1。");
  const theme = normalizeTheme({
    id: source.id,
    name: source.name,
    version: source.version,
    description: source.description,
    author: source.author,
    license: source.license,
    tags: source.tags
  });
  const compatibility = validateCompatibility(source.compatibility);
  assertString(source.css, "manifest.css");
  if (path.isAbsolute(source.css) || source.css.split(/[\\/]/).includes("..")) throw themeError("BUDDYHUE_INVALID_PACKAGE", "manifest.css 必须是工程目录内的相对路径。");
  if (source.images !== undefined) {
    assertObject(source.images, "manifest.images");
    if (Object.keys(source.images).length > MAX_IMAGES) throw themeError("BUDDYHUE_INVALID_PACKAGE", `manifest.images 不能超过 ${MAX_IMAGES} 项。`);
    for (const [id, filename] of Object.entries(source.images)) {
      if (!SAFE_ID.test(id)) throw themeError("BUDDYHUE_INVALID_PACKAGE", `图片 ID '${id}' 不合法。`);
      assertString(filename, `manifest.images.${id}`);
      if (path.isAbsolute(filename) || filename.split(/[\\/]/).includes("..")) throw themeError("BUDDYHUE_INVALID_PACKAGE", `图片 '${id}' 必须位于工程目录内。`);
      if (!SAFE_IMAGE_TYPES.has(path.extname(filename).toLowerCase())) throw themeError("BUDDYHUE_INVALID_PACKAGE", `图片 '${id}' 的格式不受支持。`);
    }
  }
  return { theme, compatibility, css: source.css, images: source.images, verification: source.verification };
}

export async function buildBuddyHuePackage(manifestFilename) {
  const manifestPath = path.resolve(manifestFilename);
  const base = path.dirname(manifestPath);
  const realBase = await realpath(base);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw themeError("BUDDYHUE_INVALID_PACKAGE", `无法读取皮肤 manifest：${error.message}`);
  }
  const source = validateSourceManifest(manifest);
  const readProjectFile = async (relative, encoding = null) => {
    let filename;
    try {
      filename = await realpath(path.resolve(base, relative));
    } catch (error) {
      throw themeError("BUDDYHUE_INVALID_PACKAGE", `无法读取皮肤资源 '${relative}'：${error.message}`);
    }
    if (filename !== realBase && !filename.startsWith(`${realBase}${path.sep}`)) {
      throw themeError("BUDDYHUE_INVALID_PACKAGE", `资源路径越出皮肤工程目录：${relative}`);
    }
    return readFile(filename, encoding ?? undefined);
  };
  const css = await readProjectFile(source.css, "utf8");
  if (Buffer.byteLength(css) > MAX_CSS_BYTES) throw themeError("BUDDYHUE_INVALID_PACKAGE", "CSS 超过 1MB 限制。");
  const images = {};
  for (const [id, filename] of Object.entries(source.images ?? {})) {
    const extension = path.extname(filename).toLowerCase();
    images[id] = {
      filename: path.basename(filename).replace(/[^a-z0-9._-]/gi, "-") || `${id}${extension}`,
      mimeType: SAFE_IMAGE_TYPES.get(extension),
      base64: (await readProjectFile(filename)).toString("base64")
    };
  }
  const body = {
    format: BUDDYHUE_FORMAT,
    schemaVersion: BUDDYHUE_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    theme: source.theme,
    compatibility: source.compatibility,
    payload: {
      css,
      ...(Object.keys(images).length ? { images } : {}),
      ...(source.verification ? { verification: source.verification } : {})
    }
  };
  const bundle = validateBuddyHuePackage({
    ...body,
    integrity: { algorithm: "sha256", digest: packageDigest(body) }
  });
  const serialized = `${JSON.stringify(bundle, null, 2)}\n`;
  if (Buffer.byteLength(serialized) > MAX_PACKAGE_BYTES) throw themeError("BUDDYHUE_INVALID_PACKAGE", "皮肤包超过 30MB 限制。");
  return { bundle, serialized, warnings: buddyHueLintWarnings(bundle) };
}

export async function writeBuddyHuePackage(manifestFilename, outputFilename, { force = false } = {}) {
  const output = path.resolve(outputFilename);
  if (!output.endsWith(BUDDYHUE_EXTENSION)) throw themeError("BUDDYHUE_INVALID_PACKAGE", `输出文件必须以 ${BUDDYHUE_EXTENSION} 结尾。`);
  if (!force) {
    try {
      await access(output);
      throw themeError("BUDDYHUE_OUTPUT_EXISTS", `输出文件已存在：${output}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const { bundle, serialized, warnings } = await buildBuddyHuePackage(manifestFilename);
  const temporary = `${output}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, serialized, { flag: "wx" });
    try {
      await rename(temporary, output);
    } catch (error) {
      if (!force || !["EEXIST", "EPERM"].includes(error.code)) throw error;
      await unlink(output).catch((unlinkError) => {
        if (unlinkError.code !== "ENOENT") throw unlinkError;
      });
      await rename(temporary, output);
    }
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  return { output, bundle, warnings };
}

export async function readBuddyHuePackage(filename) {
  const resolved = path.resolve(filename);
  if (!resolved.endsWith(BUDDYHUE_EXTENSION)) throw themeError("BUDDYHUE_INVALID_PACKAGE", `BuddyHue 皮肤包必须使用 ${BUDDYHUE_EXTENSION} 扩展名。`);
  const fileStat = await stat(resolved);
  if (fileStat.size > MAX_PACKAGE_BYTES) throw themeError("BUDDYHUE_INVALID_PACKAGE", "皮肤包超过 30MB 限制。");
  let parsed;
  try {
    parsed = JSON.parse(await readFile(resolved, "utf8"));
  } catch (error) {
    throw themeError("BUDDYHUE_INVALID_PACKAGE", `无法读取皮肤包：${error.message}`);
  }
  return validateBuddyHuePackage(parsed);
}

export async function loadThemeArtifact(filename) {
  const resolved = path.resolve(filename);
  if (resolved.endsWith(BUDDYHUE_EXTENSION)) {
    const bundle = await readBuddyHuePackage(resolved);
    const codeDrobeBundle = toCodeDrobeBundle(bundle);
    return {
      file: resolved,
      format: BUDDYHUE_FORMAT,
      theme: bundle.theme,
      compatibility: bundle.compatibility,
      integrity: bundle.integrity,
      warnings: buddyHueLintWarnings(bundle),
      targetTheme: resolveThemeTarget(codeDrobeBundle, "workbuddy"),
      images: Object.keys(bundle.payload.images ?? {})
    };
  }
  if (resolved.endsWith(".codedrobe-theme")) {
    const bundle = await readCodeDrobePackage(resolved);
    const targetTheme = resolveThemeTarget(bundle, "workbuddy");
    return {
      file: resolved,
      format: "codedrobe-theme",
      theme: { id: bundle.theme.id, name: bundle.theme.displayName, version: bundle.theme.version },
      compatibility: null,
      integrity: null,
      warnings: lintThemePackage(bundle),
      targetTheme,
      images: Object.keys(bundle.assets?.images ?? {})
    };
  }
  throw themeError("BUDDYHUE_INVALID_PACKAGE", `不支持的皮肤文件；请使用 ${BUDDYHUE_EXTENSION} 或 .codedrobe-theme。`);
}
