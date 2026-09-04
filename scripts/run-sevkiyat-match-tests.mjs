import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(tmpdir(), "sevkiyat-match-"));
const tscJs = join(root, "node_modules", "typescript", "lib", "tsc.js");

const tsc = spawnSync(
  process.execPath,
  [
    tscJs,
    "--pretty",
    "false",
    "--strict",
    "--module",
    "commonjs",
    "--moduleResolution",
    "node",
    "--target",
    "es2020",
    "--esModuleInterop",
    "--skipLibCheck",
    "--outDir",
    outDir,
    "--rootDir",
    join(root, "app", "lib"),
    join(root, "app", "lib", "sevkiyatMatch.ts"),
    join(root, "app", "lib", "sevkiyatMatch.test.ts"),
  ],
  { encoding: "utf8", cwd: root }
);

if (tsc.status !== 0) {
  process.stderr.write(tsc.stdout || "");
  process.stderr.write(tsc.stderr || "");
  rmSync(outDir, { recursive: true, force: true });
  process.exit(tsc.status ?? 1);
}

const test = spawnSync(
  process.execPath,
  ["--test", join(outDir, "sevkiyatMatch.test.js")],
  { stdio: "inherit", cwd: root }
);
rmSync(outDir, { recursive: true, force: true });
process.exit(test.status ?? 1);
