#!/usr/bin/env node
// Serves the real static export through the real FastAPI backend, so
// Playwright exercises the actual full-stack app (including auth) instead
// of just the frontend against `next dev`.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const backendRoot = path.resolve(frontendRoot, "../backend");
const staticDir = path.join(frontendRoot, "out");
const port = process.env.E2E_PORT ?? "3000";
const args = [
  "run",
  "uvicorn",
  "backend.main:app",
  "--app-dir",
  "src",
  "--host",
  "127.0.0.1",
  "--port",
  port,
];

// On Windows, `uv` resolves via a shell-dependent shim, so shell:true is
// needed -- but that means args must be pre-joined into one string, since
// shell:true + a separate args array leaves them unescaped (Node warns
// about this). All arguments here are fixed or our own numeric port, never
// external input, so string-joining them is safe.
const uvicorn = spawn(
  process.platform === "win32" ? `uv ${args.join(" ")}` : "uv",
  process.platform === "win32" ? [] : args,
  {
    cwd: backendRoot,
    env: { ...process.env, STATIC_DIR: staticDir },
    stdio: "inherit",
    shell: process.platform === "win32",
  }
);

uvicorn.on("exit", (code) => process.exit(code ?? 0));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => uvicorn.kill(signal));
}
