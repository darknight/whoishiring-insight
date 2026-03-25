import { readJSON } from "./lib/r2.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "../..");
const OUT_DIR = join(ROOT, "src/data");

const AGGREGATED_FILES = [
  "monthly-stats.json",
  "overview.json",
  "city-stats.json",
  "tech-stats.json",
  "company-stats.json",
  "trend-stats.json",
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log("从 R2 下载聚合数据到 src/data/...\n");

  for (const file of AGGREGATED_FILES) {
    const data = await readJSON(`aggregated/${file}`);
    if (data === null) {
      console.warn(`  跳过: aggregated/${file} 不存在`);
      continue;
    }
    writeFileSync(join(OUT_DIR, file), JSON.stringify(data, null, 2), "utf-8");
    console.log(`  ${file}`);
  }

  console.log("\n下载完成!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
