// Copies the scraper's output (../data/*.json) into public/data so the PWA can
// serve it. Runs before dev and build. Safe if the source dir is empty/missing.
import { mkdir, readdir, copyFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, "..", "..", "data");
const outDir = resolve(here, "..", "public", "data");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

await mkdir(outDir, { recursive: true });

if (!(await exists(srcDir))) {
  console.warn(`[copy-data] no source dir at ${srcDir} — skipping`);
  process.exit(0);
}

const files = (await readdir(srcDir)).filter((f) => f.endsWith(".json"));
for (const f of files) {
  await copyFile(resolve(srcDir, f), resolve(outDir, f));
  console.log(`[copy-data] ${f}`);
}
if (files.length === 0) console.warn("[copy-data] no .json files found");
