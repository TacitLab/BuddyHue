import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { clearState, readState, recordAppliedState, stateFilename } from "../src/state.mjs";

test("stores and clears a minimal local apply receipt", async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "buddyhue-state-"));
  const options = { env: { BUDDYHUE_STATE_DIR: stateDir } };
  const artifact = {
    file: "/tmp/theme.buddyhue-theme",
    format: "buddyhue-theme",
    theme: { id: "test", name: "Test", version: "1.0.0" },
    integrity: { algorithm: "sha256", digest: "a".repeat(64) }
  };
  await recordAppliedState({ artifact, appVersion: "5.9.1", port: 9336 }, options);
  const state = await readState(options);
  assert.equal(state.active.theme.id, "test");
  assert.equal(state.active.package.digest, "a".repeat(64));
  assert.equal(state.active.workbuddy.version, "5.9.1");
  await clearState(options);
  assert.equal(await readState(options), null);
});

test("uses the platform state directory unless overridden", () => {
  assert.equal(
    stateFilename({ env: { BUDDYHUE_STATE_DIR: "/tmp/custom-buddyhue" }, platform: "darwin", home: "/Users/example" }),
    "/tmp/custom-buddyhue/state.json"
  );
});
