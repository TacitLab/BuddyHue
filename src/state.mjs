import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";

export const STATE_SCHEMA_VERSION = 1;

export function stateFilename({ env = process.env, platform = process.platform, home = homedir() } = {}) {
  if (env.BUDDYHUE_STATE_DIR) return join(env.BUDDYHUE_STATE_DIR, "state.json");
  if (platform === "darwin") return join(home, "Library", "Application Support", "BuddyHue", "state.json");
  if (platform === "win32") return join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "BuddyHue", "state.json");
  return join(env.XDG_STATE_HOME ?? join(home, ".local", "state"), "buddyhue", "state.json");
}

export async function readState(options = {}) {
  const filename = stateFilename(options);
  try {
    const value = JSON.parse(await readFile(filename, "utf8"));
    if (value?.schemaVersion !== STATE_SCHEMA_VERSION) return null;
    return value;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    return { schemaVersion: STATE_SCHEMA_VERSION, corrupted: true, error: error.message };
  }
}

export async function recordAppliedState({ artifact, appVersion, port }, options = {}) {
  const filename = stateFilename(options);
  const value = {
    schemaVersion: STATE_SCHEMA_VERSION,
    active: {
      theme: artifact.theme,
      package: {
        format: artifact.format,
        file: artifact.file,
        digest: artifact.integrity?.digest ?? null
      },
      workbuddy: { version: appVersion, port },
      appliedAt: new Date().toISOString()
    }
  };
  await mkdir(dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  await rename(temporary, filename);
  return value;
}

export async function clearState(options = {}) {
  const filename = stateFilename(options);
  await unlink(filename).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}
