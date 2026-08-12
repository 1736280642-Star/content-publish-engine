import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const roots = ["packages/platforms", "servers", "scripts", "tests"];
const projectRoot = new URL("../", import.meta.url);
const files = [];

async function collect(directoryUrl) {
  for (const entry of await readdir(directoryUrl, { withFileTypes: true })) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directoryUrl);
    if (entry.isDirectory()) await collect(child);
    else if (entry.name.endsWith(".mjs")) files.push(fileURLToPath(child));
  }
}

for (const root of roots) await collect(new URL(`${root}/`, projectRoot));

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exitCode = 1;
  }
}

if (!process.exitCode) console.log(`Syntax check passed for ${files.length} JavaScript files.`);
