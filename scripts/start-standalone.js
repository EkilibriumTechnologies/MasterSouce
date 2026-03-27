"use strict";

/**
 * Next.js standalone reads `process.env.HOSTNAME` for the HTTP bind address.
 * Docker/Railway set HOSTNAME to the container id; binding only to that breaks
 * the platform proxy → "Application failed to respond" (502).
 */
const { spawn } = require("child_process");
const path = require("path");

const serverJs = path.join(__dirname, "..", ".next", "standalone", "server.js");

const child = spawn(process.execPath, [serverJs], {
  stdio: "inherit",
  env: {
    ...process.env,
    HOSTNAME: "0.0.0.0"
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 1);
});
