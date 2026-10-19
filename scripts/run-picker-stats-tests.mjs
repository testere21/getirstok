import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(tmpdir(), "picker-stats-"));
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
    join(root, "app", "lib", "dpsReportParse.ts"),
    join(root, "app", "lib", "dpsReportParse.test.ts"),
    join(root, "app", "lib", "pickerStatsMerge.ts"),
    join(root, "app", "lib", "pickerStatsMerge.test.ts"),
    join(root, "app", "lib", "pickerStatsPeriod.ts"),
    join(root, "app", "lib", "pickerStatsPeriod.test.ts"),
    join(root, "app", "lib", "dpsRange.ts"),
    join(root, "app", "lib", "pickerMetrics.ts"),
    join(root, "app", "lib", "pickerMetrics.test.ts"),
  ],
  { encoding: "utf8", cwd: root }
);

if (tsc.status !== 0) {
  process.stderr.write(tsc.stdout || "");
  process.stderr.write(tsc.stderr || "");
  rmSync(outDir, { recursive: true, force: true });
  process.exit(tsc.status ?? 1);
}

// Derlenen dosyalar geçici klasörde; exceljs'i proje node_modules'tan bulsun
const test = spawnSync(
  process.execPath,
  [
    "--test",
    join(outDir, "dpsReportParse.test.js"),
    join(outDir, "pickerStatsMerge.test.js"),
    join(outDir, "pickerStatsPeriod.test.js"),
    join(outDir, "pickerMetrics.test.js"),
  ],
  { stdio: "inherit", cwd: root, env: { ...process.env, NODE_PATH: join(root, "node_modules") } }
);
rmSync(outDir, { recursive: true, force: true });
process.exit(test.status ?? 1);
