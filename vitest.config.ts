import { defineConfig } from "vitest/config";

// Main-process unit tests only, for now.
//
// Everything under test here is deliberately pure — money, rounding, GSTIN — so
// these run under plain node with no database. That matters: better-sqlite3 in
// this repo is built against Electron's ABI, so anything importing the data
// layer has to run under `ELECTRON_RUN_AS_NODE=1 npx electron` instead. Keeping
// the tax engine free of I/O is what lets `npm test` stay a one-word command.
export default defineConfig({
  test: {
    include: ["src/electron/**/*.test.ts"],
    environment: "node",
  },
});
