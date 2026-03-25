import { writeJSON } from "./lib/r2.ts";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "../..");

async function main() {
  // Upload raw/
  const rawDir = join(ROOT, "data/raw");
  const rawFiles = readdirSync(rawDir).filter((f) => f.endsWith(".json"));
  console.log(`Uploading ${rawFiles.length} raw files...`);
  for (const file of rawFiles) {
    const data = JSON.parse(readFileSync(join(rawDir, file), "utf-8"));
    await writeJSON(`raw/${file}`, data);
    console.log(`  raw/${file}`);
  }

  // Upload parsed/
  const parsedDir = join(ROOT, "data/parsed");
  const parsedFiles = readdirSync(parsedDir).filter((f) => f.endsWith(".json"));
  console.log(`Uploading ${parsedFiles.length} parsed files...`);
  for (const file of parsedFiles) {
    const data = JSON.parse(readFileSync(join(parsedDir, file), "utf-8"));
    await writeJSON(`parsed/${file}`, data);
    console.log(`  parsed/${file}`);
  }

  // Upload aggregated/
  const srcDataDir = join(ROOT, "src/data");
  const aggFiles = readdirSync(srcDataDir).filter((f) => f.endsWith(".json"));
  console.log(`Uploading ${aggFiles.length} aggregated files...`);
  for (const file of aggFiles) {
    const data = JSON.parse(readFileSync(join(srcDataDir, file), "utf-8"));
    await writeJSON(`aggregated/${file}`, data);
    console.log(`  aggregated/${file}`);
  }

  console.log("Migration complete!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
