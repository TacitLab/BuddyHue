import { homedir } from "node:os";
import path from "node:path";

function resolveUserPath(value, home) {
  if (value === "~") return home;
  if (value.startsWith(`~${path.sep}`) || value.startsWith("~/") || value.startsWith("~\\")) {
    return path.resolve(home, value.slice(2));
  }
  return path.resolve(value);
}

export function buddyHueHome({ env = process.env, home = homedir() } = {}) {
  if (env.BUDDYHUE_HOME) return resolveUserPath(env.BUDDYHUE_HOME, home);
  return path.join(home, ".buddyhue");
}
