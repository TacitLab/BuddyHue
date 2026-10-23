#!/usr/bin/env node

import { BUDDYHUE_VERSION } from "../src/buddyhue.mjs";
import { run } from "../src/cli.mjs";
import { checkForUpdate } from "../src/update.mjs";

const argv = process.argv.slice(2);
const updateCheck = argv[0] === "upgrade"
  ? null
  : checkForUpdate(BUDDYHUE_VERSION, { env: process.env });
const exitCode = await run(argv, console, { updateCheck });
process.exitCode = exitCode;
