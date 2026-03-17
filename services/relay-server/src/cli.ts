#!/usr/bin/env node

import { RelayCliUserError } from "./cli-error.js";
import { runRelayCli } from "./relay-cli.js";

try {
  await runRelayCli(process.argv.slice(2));
} catch (error) {
  if (error instanceof RelayCliUserError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
